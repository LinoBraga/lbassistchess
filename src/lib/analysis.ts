import { Chess } from 'chess.js';

export interface PositionAnalysis {
  ply: number;
  fen: string;
  move: string | null;
  bestMove: string | null;
  evalCp: number | null;
  evalMate: number | null;
  depth: number;
  pv: string | null;
  classification: MoveClassification | null;
}

export type MoveClassification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface AnalysisConfig {
  depth: number;
  movetime: number;
  multiPv: number;
}

export interface AnalysisSummary {
  best: number;
  excellent: number;
  good: number;
  inaccuracies: number;
  mistakes: number;
  blunders: number;
  accuracyWhite: number | null;
  accuracyBlack: number | null;
  totalMoves: number;
  analyzedAt: string;
}

export interface FullAnalysis {
  positions: PositionAnalysis[];
  summary: AnalysisSummary;
}

export interface AnalysisProgress {
  current: number;
  total: number;
  position: PositionAnalysis | null;
}

/**
 * Limites de perda de avaliação (em centipeões) para classificação de lances.
 * Valores padrão baseados em práticas comuns de análise de xadrez.
 */
export const CLASSIFICATION_THRESHOLDS = {
  excellent: 10,   // 0.1 peões — melhor lance ou equivalente
  good: 30,         // 0.3 peões — pequena perda aceitável
  inaccuracy: 50,   // 0.5 peões
  mistake: 100,     // 1.0 peão
  blunder: 300,     // 3.0 peões
};

export const DEFAULT_CONFIG: AnalysisConfig = {
  depth: 15,
  movetime: 1000,
  multiPv: 1,
};

interface WorkerMessage {
  type: 'ready' | 'info' | 'bestmove' | 'error';
  depth?: number;
  scoreCp?: number;
  scoreMate?: number;
  pv?: string;
  bestMove?: string;
  multiPv?: number;
}

/**
 * Analisa uma partida posição por posição usando o Stockfish via Web Worker.
 *
 * Estratégia:
 * 1. Reconstrói a sequência de posições a partir do PGN com chess.js.
 * 2. Para cada posição, pede ao Stockfish a avaliação e o melhor lance.
 * 3. Compara a avaliação antes/depois do lance para classificar a qualidade.
 * 4. Avaliações são sempre da perspectiva das brancas (evalCp > 0 = brancas vantajosas).
 *    Mate positivo = brancas dão mate; mate negativo = pretas dão mate.
 */
export class GameAnalyzer {
  private worker: Worker | null = null;
  private ready = false;
  private cancelled = false;

  async init(): Promise<void> {
    this.worker = new Worker(
      new URL('../workers/stockfishWorker.ts', import.meta.url),
      { type: 'module' },
    );

    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Falha ao criar worker'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao inicializar Stockfish'));
      }, 30000);

      this.worker.addEventListener('message', (e: MessageEvent<WorkerMessage>) => {
        if (e.data.type === 'ready') {
          this.ready = true;
          clearTimeout(timeout);
          resolve();
        } else if (e.data.type === 'error') {
          clearTimeout(timeout);
          reject(new Error('Erro ao carregar Stockfish'));
        }
      });

      this.worker.postMessage({ type: 'init' });
    });
  }

  /**
   * Analisa todas as posições de uma partida PGN.
   * Chama onProgress a cada posição analisada.
   */
  async analyzeGame(
    pgn: string,
    config: AnalysisConfig,
    onProgress: (progress: AnalysisProgress) => void,
  ): Promise<FullAnalysis> {
    this.cancelled = false;

    const chess = new Chess();
    chess.loadPgn(pgn);
    const moves = chess.history();

    // Reconstruir posições: posição inicial (ply 0) + uma após cada lance
    const positions: { fen: string; move: string; ply: number }[] = [];
    chess.reset();
    positions.push({ fen: chess.fen(), move: '', ply: 0 });
    for (let i = 0; i < moves.length; i++) {
      chess.move(moves[i]);
      positions.push({ fen: chess.fen(), move: moves[i], ply: i + 1 });
    }

    // Avaliar cada posição (incluindo a inicial)
    const results: PositionAnalysis[] = [];
    let prevEval: { cp: number | null; mate: number | null } = { cp: 0, mate: null };

    for (let i = 0; i < positions.length; i++) {
      if (this.cancelled) throw new Error('cancelled');

      const pos = positions[i];
      const evaluation = await this.analyzePosition(pos.fen, config);

      const positionResult: PositionAnalysis = {
        ply: pos.ply,
        fen: pos.fen,
        move: pos.move || null,
        bestMove: evaluation.bestMove,
        evalCp: evaluation.scoreCp ?? null,
        evalMate: evaluation.scoreMate ?? null,
        depth: evaluation.depth ?? 0,
        pv: evaluation.pv ?? null,
        classification: null,
      };

      // Classificar o lance (a posição i é o resultado do lance i, que foi jogado na posição i-1)
      if (i > 0 && pos.move) {
        positionResult.classification = classifyMove(
          prevEval,
          { cp: evaluation.scoreCp ?? null, mate: evaluation.scoreMate ?? null },
          getSideToMove(positions[i - 1].fen), // quem jogou o lance
        );
      }

      results.push(positionResult);
      prevEval = { cp: evaluation.scoreCp ?? null, mate: evaluation.scoreMate ?? null };

      onProgress({
        current: i + 1,
        total: positions.length,
        position: positionResult,
      });
    }

    const summary = computeSummary(results);
    return { positions: results, summary };
  }

  /**
   * Avalia uma única posição FEN com o Stockfish.
   */
  private analyzePosition(
    fen: string,
    config: AnalysisConfig,
  ): Promise<{
    scoreCp: number | null;
    scoreMate: number | null;
    depth: number;
    pv: string | null;
    bestMove: string | null;
  }> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker não inicializado'));
        return;
      }

      let bestResult: {
        scoreCp: number | null;
        scoreMate: number | null;
        depth: number;
        pv: string | null;
      } = { scoreCp: null, scoreMate: null, depth: 0, pv: null };

      let bestMove: string | null = null;
      let resolved = false;

      const cleanup = () => {
        this.worker?.removeEventListener('message', handler);
      };

      const handler = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data;

        if (msg.type === 'info' && (msg.multiPv === undefined || msg.multiPv === 1)) {
          // Atualizar a melhor avaliação (profundidade mais alta)
          if (msg.depth && msg.depth >= bestResult.depth) {
            bestResult = {
              scoreCp: msg.scoreCp ?? null,
              scoreMate: msg.scoreMate ?? null,
              depth: msg.depth,
              pv: msg.pv ?? null,
            };
          }
        }

        if (msg.type === 'bestmove') {
          if (resolved) return;
          resolved = true;
          bestMove = msg.bestMove ?? null;
          cleanup();
          resolve({
            scoreCp: bestResult.scoreCp,
            scoreMate: bestResult.scoreMate,
            depth: bestResult.depth,
            pv: bestResult.pv,
            bestMove,
          });
        }

        if (msg.type === 'error') {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(new Error('Stockfish erro'));
        }
      };

      this.worker.addEventListener('message', handler);

      // Enviar comando de análise
      this.worker.postMessage({
        type: 'analyze',
        fen,
        depth: config.depth,
        movetime: config.movetime,
        multiPv: config.multiPv,
      });
    });
  }

  cancel(): void {
    this.cancelled = true;
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
    }
  }

  terminate(): void {
    this.cancelled = true;
    if (this.worker) {
      this.worker.postMessage({ type: 'quit' });
      this.worker.terminate();
      this.worker = null;
    }
    this.ready = false;
  }
}

/**
 * Determina de qual lado deve jogar a partir de um FEN.
 */
function getSideToMove(fen: string): 'w' | 'b' {
  return fen.split(' ')[1] === 'w' ? 'w' : 'b';
}

/**
 * Classifica um lance comparando a avaliação antes e depois.
 *
 * - As avaliações são da perspectiva das brancas (evalCp > 0 = brancas vantajosas).
 * - Para classificar o lance, calculamos a perda de avaliação do ponto de vista
 *   do jogador que jogou.
 * - Posições de mate são tratadas separadamente.
 */
export function classifyMove(
  before: { cp: number | null; mate: number | null },
  after: { cp: number | null; mate: number | null },
  sideToMove: 'w' | 'b',
): MoveClassification {
  // Converter avaliações para centipeões da perspectiva de quem joga
  const beforePlayer = toPlayerPerspective(before, sideToMove);
  const afterPlayer = toPlayerPerspective(after, sideToMove);

  // Se a posição anterior era mate e a atual não é mais, o jogador escapou/foi para mate
  if (before.mate !== null && after.mate !== null) {
    // Continua mate — verificar se piorou
    const beforeAbs = Math.abs(before.mate);
    const afterAbs = Math.abs(after.mate);
    const beforeGood = before.mate > 0 === (sideToMove === 'w');
    const afterGood = after.mate > 0 === (sideToMove === 'w');

    if (beforeGood && !afterGood) return 'blunder'; // tinha mate e perdeu
    if (!beforeGood && afterGood) return 'best'; // oponente estava dando mate e escapou
    if (beforeGood && afterGood && afterAbs > beforeAbs) return 'inaccuracy'; // demorou mais para dar mate
    return 'best';
  }

  // Converter mate para centipeões para comparação
  let beforeCp: number;
  let afterCp: number;

  if (before.mate !== null) {
    beforeCp = before.mate > 0 ? 10000 : -10000;
  } else {
    beforeCp = before.cp ?? 0;
  }

  if (after.mate !== null) {
    afterCp = after.mate > 0 ? 10000 : -10000;
  } else {
    afterCp = after.cp ?? 0;
  }

  // Perda de avaliação na perspectiva do jogador
  const loss = beforePlayer - afterPlayer;

  if (loss < CLASSIFICATION_THRESHOLDS.excellent) return 'best';
  if (loss < CLASSIFICATION_THRESHOLDS.good) return 'excellent';
  if (loss < CLASSIFICATION_THRESHOLDS.inaccuracy) return 'good';
  if (loss < CLASSIFICATION_THRESHOLDS.mistake) return 'inaccuracy';
  if (loss < CLASSIFICATION_THRESHOLDS.blunder) return 'mistake';
  return 'blunder';
}

/**
 * Converte uma avaliação da perspectiva das brancas para a perspectiva do jogador.
 */
function toPlayerPerspective(
  evaluation: { cp: number | null; mate: number | null },
  sideToMove: 'w' | 'b',
): number {
  if (evaluation.mate !== null) {
    const matePlayer = evaluation.mate > 0 === (sideToMove === 'w');
    return matePlayer ? 10000 : -10000;
  }
  const cp = evaluation.cp ?? 0;
  return sideToMove === 'w' ? cp : -cp;
}

/**
 * Computa o resumo da análise: contagem de imprecisões, erros, erros graves
 * e acurácia por lado.
 */
function computeSummary(positions: PositionAnalysis[]): AnalysisSummary {
  let best = 0;
  let excellent = 0;
  let good = 0;
  let inaccuracies = 0;
  let mistakes = 0;
  let blunders = 0;

  let whiteTotalLoss = 0;
  let whiteMoveCount = 0;
  let blackTotalLoss = 0;
  let blackMoveCount = 0;

  for (const pos of positions) {
    if (!pos.classification) continue;

    if (pos.classification === 'best') best++;
    else if (pos.classification === 'excellent') excellent++;
    else if (pos.classification === 'good') good++;
    else if (pos.classification === 'inaccuracy') inaccuracies++;
    else if (pos.classification === 'mistake') mistakes++;
    else if (pos.classification === 'blunder') blunders++;

    const side = getSideToMoveFromPly(pos.ply);
    const loss = getLossAmount(pos.classification);

    if (side === 'w') {
      whiteTotalLoss += loss;
      whiteMoveCount++;
    } else {
      blackTotalLoss += loss;
      blackMoveCount++;
    }
  }

  const accuracyWhite = whiteMoveCount > 0
    ? Math.max(0, Math.round(100 - (whiteTotalLoss / whiteMoveCount) * 0.1))
    : null;
  const accuracyBlack = blackMoveCount > 0
    ? Math.max(0, Math.round(100 - (blackTotalLoss / blackMoveCount) * 0.1))
    : null;

  return {
    best,
    excellent,
    good,
    inaccuracies,
    mistakes,
    blunders,
    accuracyWhite,
    accuracyBlack,
    totalMoves: positions.filter((p) => p.classification).length,
    analyzedAt: new Date().toISOString(),
  };
}

function getSideToMoveFromPly(ply: number): 'w' | 'b' {
  // ply 1 = primeiro lance das brancas, ply 2 = pretas, etc.
  return ply % 2 === 1 ? 'w' : 'b';
}

function getLossAmount(cls: MoveClassification): number {
  switch (cls) {
    case 'best': return 0;
    case 'excellent': return 0;
    case 'good': return 10;
    case 'inaccuracy': return 50;
    case 'mistake': return 100;
    case 'blunder': return 300;
  }
}

/**
 * Formata a avaliação para exibição.
 * Retorna string como "+1.5", "-2.3", "M3", "-M5".
 */
export function formatEval(evalCp: number | null, evalMate: number | null): string {
  if (evalMate !== null) {
    return `${evalMate > 0 ? '+' : '-'}M${Math.abs(evalMate)}`;
  }
  if (evalCp === null) return '0.0';
  const pawns = evalCp / 100;
  const sign = pawns >= 0 ? '+' : '';
  return `${sign}${pawns.toFixed(1)}`;
}

/**
 * Retorna a cor de fundo para a barra de avaliação.
 * Mais verde = vantagem das brancas, mais vermelho = pretas.
 */
export function evalBarColor(evalCp: number | null, evalMate: number | null): string {
  if (evalMate !== null) {
    return evalMate > 0 ? 'bg-success-500' : 'bg-danger-500';
  }
  if (evalCp === null) return 'bg-ink-border';
  const clamped = Math.max(-1000, Math.min(1000, evalCp));
  const ratio = (clamped + 1000) / 2000; // 0 = pretas, 1 = brancas
  if (ratio > 0.5) return 'bg-success-500';
  if (ratio < 0.5) return 'bg-danger-500';
  return 'bg-warning-400';
}

/**
 * Retorna o rótulo e cor da classificação do lance.
 */
export function classificationLabel(cls: MoveClassification | null): { label: string; color: string; bg: string } {
  if (!cls) return { label: '', color: '', bg: '' };
  switch (cls) {
    case 'best': return { label: 'Melhor', color: 'text-success-400', bg: 'bg-success-500/20' };
    case 'excellent': return { label: 'Excelente', color: 'text-success-300', bg: 'bg-success-500/10' };
    case 'good': return { label: 'Bom', color: 'text-cyan-400', bg: 'bg-cyan-500/10' };
    case 'inaccuracy': return { label: 'Imprecisão', color: 'text-warning-300', bg: 'bg-warning-500/15' };
    case 'mistake': return { label: 'Erro', color: 'text-orange-400', bg: 'bg-orange-500/15' };
    case 'blunder': return { label: 'Erro grave', color: 'text-danger-400', bg: 'bg-danger-500/20' };
  }
}
