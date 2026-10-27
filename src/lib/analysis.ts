import { Chess } from 'chess.js';

/**
 * Resultado da análise de uma posição.
 *
 * CONVENÇÃO DE AVALIAÇÃO: evalCp e evalMate são SEMPRE da perspectiva das BRANCAS:
 *   evalCp  > 0  → brancas vantajosas;  < 0 → pretas vantajosas
 *   evalMate > 0 → brancas dão mate;    < 0 → pretas dão mate
 * O Stockfish reporta na perspectiva do lado que joga; a normalização acontece
 * em GameAnalyzer.analyzeGame antes de armazenar aqui.
 */
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
  requestId?: number;
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
  private requestId = 0;

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

      // Timeout específico do handshake UCI (uci -> uciok -> isready -> readyok).
      // 30s cobre downloads do .wasm em conexões lentas; se expirar, é falha de
      // carregamento/ handshake, não de análise.
      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao inicializar Stockfish: o motor não respondeu ao handshake UCI (uciok/readyok) em 30s. Verifique se stockfish.js e stockfish.wasm estão acessíveis no caminho correto.'));
      }, 30000);

      this.worker.addEventListener('message', (e: MessageEvent<WorkerMessage>) => {
        if (e.data.type === 'ready') {
          this.ready = true;
          clearTimeout(timeout);
          resolve();
        } else if (e.data.type === 'error') {
          clearTimeout(timeout);
          reject(new Error('Falha ao carregar o Stockfish no navegador. Verifique no console se stockfish.wasm está acessível.'));
        }
      });

      this.worker.addEventListener('error', (e: ErrorEvent) => {
        clearTimeout(timeout);
        console.error('[GameAnalyzer] erro no worker:', e.message, e.filename, e.lineno);
        reject(new Error(`Erro ao carregar o worker do Stockfish: ${e.message || 'arquivo não encontrado ou MIME incorreto'}`));
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

      // CRÍTICO: o Stockfish reporta score cp/mate na perspectiva do LADO QUE JOGA,
      // não das brancas. Normalizamos para a perspectiva das BRANCAS aqui, de forma
      // que toda a lógica de classificação e exibição trabalhe com uma convenção única:
      //   evalCp  > 0  → brancas vantajosas
      //   evalMate > 0 → brancas dão mate; < 0 → pretas dão mate
      // A posição i é o resultado do lance i, jogado pelo lado que tinha a vez em
      // positions[i-1]. A avaliação de `pos.fen` é da perspectiva de quem joga em
      // `pos.fen`, ou seja, o lado OPPOSTO ao que jogou o lance.
      const sideToMoveAtPos = getSideToMove(pos.fen); // quem joga em pos.fen
      const normalizedCp =
        evaluation.scoreCp === null
          ? null
          : sideToMoveAtPos === 'w' ? evaluation.scoreCp : -evaluation.scoreCp;
      const normalizedMate =
        evaluation.scoreMate === null
          ? null
          : sideToMoveAtPos === 'w' ? evaluation.scoreMate : -evaluation.scoreMate;

      const positionResult: PositionAnalysis = {
        ply: pos.ply,
        fen: pos.fen,
        move: pos.move || null,
        bestMove: evaluation.bestMove,
        // Avaliações normalizadas para a perspectiva das brancas.
        evalCp: normalizedCp,
        evalMate: normalizedMate,
        depth: evaluation.depth ?? 0,
        pv: evaluation.pv ?? null,
        classification: null,
      };

      // Classificar o lance (a posição i é o resultado do lance i, que foi jogado na posição i-1).
      // A avaliação "antes" é da posição i-1 (normalizada para brancas); a "depois" é da posição i.
      if (i > 0 && pos.move) {
        positionResult.classification = classifyMove(
          prevEval,
          { cp: normalizedCp, mate: normalizedMate },
          getSideToMove(positions[i - 1].fen), // quem jogou o lance
        );
      }

      results.push(positionResult);
      prevEval = { cp: normalizedCp, mate: normalizedMate };

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
   *
   * Cada chamada recebe um requestId exclusivo. O handler ignora qualquer
   * mensagem (info/bestmove) que não corresponda ao requestId atual, para
   * evitar que respostas atrasadas de uma análise anterior sobrescrevam os
   * resultados da posição correta.
   *
   * Além disso, valida a legalidade do bestMove retornado usando chess.js
   * na FEN enviada. Se o lance for ilegal (ex: peça em casa vazia), o
   * resultado é descartado e bestMove fica null.
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

      const currentRequestId = ++this.requestId;

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

        // Ignorar mensagens de solicitações anteriores (respostas atrasadas).
        if (msg.requestId !== undefined && msg.requestId !== currentRequestId) return;

        if (msg.type === 'info' && (msg.multiPv === undefined || msg.multiPv === 1)) {
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

          // Validar a legalidade do bestMove na posição analisada.
          // Se o lance for ilegal, descartar — provavelmente é uma resposta
          // atrasada de uma posição anterior que vazou apesar do requestId.
          if (bestMove && bestMove !== '(none)') {
            if (!isLegalMove(fen, bestMove)) {
              console.warn(
                `[GameAnalyzer] bestMove "${bestMove}" é ilegal na FEN ${fen}. ` +
                `Descartando resultado — possível resposta atrasada da posição anterior.`,
              );
              bestMove = null;
            }
          } else {
            bestMove = null;
          }

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

      this.worker.postMessage({
        type: 'analyze',
        fen,
        depth: config.depth,
        movetime: config.movetime,
        multiPv: config.multiPv,
        requestId: currentRequestId,
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
 * Verifica se um lance UCI (ex: "e2e4", "g1f3") é legal na posição dada.
 * Usa chess.js para validar. Retorna false se o lance for ilegal ou se
 * a FEN for inválida.
 */
export function isLegalMove(fen: string, uci: string): boolean {
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? uci[4] : undefined;
    const move = chess.move({ from, to, promotion });
    return move !== null;
  } catch {
    return false;
  }
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
export function toPlayerPerspective(
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
 *
 * FÓRMULA DE PRECISÃO (documentada):
 *
 * A precisão de cada jogador é a média da "acurácia por lance", onde a
 * acurácia de um lance mede quanto da "porcentagem de vitória" (win%) o
 * jogador manteve após jogar.
 *
 *   winPercent(cp) = 100 / (1 + exp(-0.00368208 * cp))
 *
 * onde cp é a avaliação na perspectiva do jogador (centipeões).  Esta
 * transformação logística é a mesma usada pelo Lichess (publicamente
 * documentada — ver github.com/lichess-org/lila, módulo de análise).
 * A constante 0.00368208 vem do artigo original do Lichess.
 *
 * Para cada lance:
 *   wpBefore = winPercent(eval antes, na perspectiva do jogador)
 *   wpAfter  = winPercent(eval depois, na perspectiva do jogador)
 *   moveAccuracy = 100 - max(0, wpBefore - wpAfter)
 *
 * A acurácia geral do jogador = média das moveAccuracy de todos os seus
 * lances.  Lances que melhoram a posição (wpAfter > wpBefore) contam como
 * 100%.  Lances que pioram reduzem proporcionalmente à queda de win%.
 *
 * Antes desta correção, a fórmula era `100 - avgLoss * 0.1` usando valores
 * FIXOS por classificação (best=0, blunder=300).  Isso comprimia quase todos
 * os resultados para perto de 100% porque a maioria dos lances é "best"
 * (perda 0) e o fator 0.1 é muito pequeno.  A nova fórmula dá:
 *   loss 0cp   → accuracy 100%
 *   loss 100cp → accuracy ~91%
 *   loss 300cp → accuracy ~73%
 *   loss 500cp → accuracy ~58%
 *
 * NÃO é a fórmula do Chess.com (que não é pública).  É compatível com a
 * fórmula pública do Lichess em estrutura, mas pode diferir em detalhes
 * (profundidade do motor, multiPV, avaliação de referência).
 */
export function computeSummary(positions: PositionAnalysis[]): AnalysisSummary {
  let best = 0;
  let excellent = 0;
  let good = 0;
  let inaccuracies = 0;
  let mistakes = 0;
  let blunders = 0;

  let whiteAccuracySum = 0;
  let whiteMoveCount = 0;
  let blackAccuracySum = 0;
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
    const prevPos = positions.find((p) => p.ply === pos.ply - 1);

    // Avaliações na perspectiva do jogador (centipeões).
    const beforeCp = evalToPlayerCp(
      { cp: prevPos?.evalCp ?? null, mate: prevPos?.evalMate ?? null },
      side,
    );
    const afterCp = evalToPlayerCp(
      { cp: pos.evalCp, mate: pos.evalMate },
      side,
    );

    const moveAcc = moveAccuracy(beforeCp, afterCp);

    if (side === 'w') {
      whiteAccuracySum += moveAcc;
      whiteMoveCount++;
    } else {
      blackAccuracySum += moveAcc;
      blackMoveCount++;
    }
  }

  const accuracyWhite = whiteMoveCount > 0
    ? Math.round(whiteAccuracySum / whiteMoveCount)
    : null;
  const accuracyBlack = blackMoveCount > 0
    ? Math.round(blackAccuracySum / blackMoveCount)
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

/**
 * Constante da transformação logística usada pelo Lichess para converter
 * centipeões em porcentagem de vitória.  Fonte: lila-analysis
 * (github.com/lichess-org/lila, módulo de análise).
 */
const WIN_PERCENT_K = 0.00368208;

/**
 * Converte uma avaliação (centipeões, perspectiva do jogador) em porcentagem
 * de vitória (0–100).  cp=0 → 50%, cp>0 → >50%, cp<0 → <50%.
 */
export function evalToWinPercent(cp: number): number {
  return 100 / (1 + Math.exp(-WIN_PERCENT_K * cp));
}

/**
 * Calcula a acurácia de um lance (0–100) a partir das avaliações antes e
 * depois, ambas na perspectiva do jogador.  Lances que melhoram a posição
 * contam como 100%.  Lances que pioram reduzem proporcionalmente à queda
 * de win%.
 */
export function moveAccuracy(beforeCp: number | null, afterCp: number | null): number {
  if (beforeCp === null || afterCp === null) return 100;
  const wpBefore = evalToWinPercent(beforeCp);
  const wpAfter = evalToWinPercent(afterCp);
  const drop = Math.max(0, wpBefore - wpAfter);
  return Math.max(0, Math.min(100, 100 - drop));
}

/**
 * Converte uma avaliação (cp/mate, perspectiva das brancas) para centipeões
 * na perspectiva do jogador.  Mate é convertido para ±10000cp.
 */
function evalToPlayerCp(
  e: { cp: number | null; mate: number | null },
  side: 'w' | 'b',
): number | null {
  let cp: number | null;
  if (e.mate !== null) {
    cp = e.mate > 0 ? 10000 : -10000;
  } else {
    cp = e.cp;
  }
  if (cp === null) return null;
  return side === 'w' ? cp : -cp;
}

/**
 * Calcula a perda real de avaliação (centipeões) na perspectiva do
 * jogador que jogou o lance.  Sempre ≥ 0 (perda negativa = melhorou = 0).
 * Trata posições de mate convertendo para ±10000cp.
 */
export function computeRealLossCp(
  before: { cp: number | null; mate: number | null },
  after: { cp: number | null; mate: number | null },
  side: 'w' | 'b',
): number | null {
  const beforeCp = evalToCp(before);
  const afterCp = evalToCp(after);
  if (beforeCp === null || afterCp === null) return null;
  const beforePlayer = side === 'w' ? beforeCp : -beforeCp;
  const afterPlayer = side === 'w' ? afterCp : -afterCp;
  return Math.max(0, beforePlayer - afterPlayer);
}

function evalToCp(e: { cp: number | null; mate: number | null }): number | null {
  if (e.mate !== null) return e.mate > 0 ? 10000 : -10000;
  return e.cp ?? null;
}

export function getSideToMoveFromPly(ply: number): 'w' | 'b' {
  // ply 1 = primeiro lance das brancas, ply 2 = pretas, etc.
  return ply % 2 === 1 ? 'w' : 'b';
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
