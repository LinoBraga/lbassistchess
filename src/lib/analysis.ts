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
 * FÓRMULA DE PRECISÃO (oficial Lichess — AccuracyPercent.scala):
 *
 * 1) winPercent(cp) = 100 / (1 + exp(-0.00368208 * cp))   [preservada]
 *
 * 2) Acurácia por lance (fromWinPercents):
 *      if wpAfter >= wpBefore: 100
 *      else:
 *        winDiff   = wpBefore - wpAfter
 *        raw       = 103.1668 * exp(-0.04354 * winDiff) - 3.1669
 *        accuracy  = clamp(raw + 1, 0, 100)   // +1 = bônus de incerteza
 *
 * 3) Acurácia da partida (gameAccuracy):
 *      - Lista contínua de win% (wp0 = 50% inicial, wp1, wp2, ...)
 *      - windowSize = clamp(cps.length / 10, 2, 8)
 *      - Para cada janela deslizante de tamanho windowSize, peso =
 *          clamp(stdev(janela), 0.5, 12)
 *      - Para cada par consecutivo (wp[i], wp[i+1]):
 *          color    = (i % 2 == 0) == startColorIsWhite ? white : black
 *          accuracy = fromWinPercents(perspectiva da color, wp[i], wp[i+1])
 *          peso     = peso da janela correspondente
 *      - Por cor: mean( (weightedMean(acurácias, pesos), harmonicMean(acurácias) )
 *      - Acurácia da cor = (weightedMean + harmonicMean) / 2
 *
 * A agregação NÃO é média aritmética simples. Combina média ponderada
 * (por volatilidade da posição) com média harmônica, dando mais peso a
 * lances em posições voláteis e penalizando mais lances muito ruins.
 *
 * Referência: github.com/lichess-org/lila, modules/analyse/src/main/AccuracyPercent.scala
 * Documentação pública: https://lichess.org/page/accuracy
 */
export function computeSummary(positions: PositionAnalysis[]): AnalysisSummary {
  let best = 0;
  let excellent = 0;
  let good = 0;
  let inaccuracies = 0;
  let mistakes = 0;
  let blunders = 0;

  // Contagens de classificação (preservado).
  for (const pos of positions) {
    if (!pos.classification) continue;
    if (pos.classification === 'best') best++;
    else if (pos.classification === 'excellent') excellent++;
    else if (pos.classification === 'good') good++;
    else if (pos.classification === 'inaccuracy') inaccuracies++;
    else if (pos.classification === 'mistake') mistakes++;
    else if (pos.classification === 'blunder') blunders++;
  }

  // Acurácia da partida via algoritmo oficial do Lichess.
  const accuracyWhite = gameAccuracy(positions, 'w');
  const accuracyBlack = gameAccuracy(positions, 'b');

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
 * depois, ambas na perspectiva do jogador (centipeões).  Implementa a
 * fórmula pública oficial do Lichess (AccuracyPercent.fromWinPercents).
 *
 * Referência: github.com/lichess-org/lila, AccuracyPercent.scala.
 *
 *   if wpAfter >= wpBefore: 100
 *   else:
 *     winDiff  = wpBefore - wpAfter
 *     raw      = 103.1668 * exp(-0.04354 * winDiff) - 3.1669
 *     accuracy = clamp(raw + 1, 0, 100)   // +1 = bônus de incerteza
 */
export function moveAccuracy(beforeCp: number | null, afterCp: number | null): number {
  if (beforeCp === null || afterCp === null) return 100;
  const wpBefore = evalToWinPercent(beforeCp);
  const wpAfter = evalToWinPercent(afterCp);
  return accuracyFromWinPercents(wpBefore, wpAfter);
}

/**
 * Acurácia por lance a partir de win% antes/depois (perspectiva do jogador).
 * Reproduz exatamente AccuracyPercent.fromWinPercents do Lichess:
 *   - se não houve perda (wpAfter >= wpBefore): 100
 *   - senão: 103.1668 * exp(-0.04354 * winDiff) - 3.1669, +1 de bônus,
 *     clampado em [0, 100].
 */
export function accuracyFromWinPercents(wpBefore: number, wpAfter: number): number {
  if (wpAfter >= wpBefore) return 100;
  const winDiff = wpBefore - wpAfter;
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * winDiff) + -3.166924740191411;
  const withBonus = raw + 1; // bônus de incerteza (análise imperfeita)
  return Math.max(0, Math.min(100, withBonus));
}

/**
 * Acurácia da partida por cor, usando o algoritmo oficial do Lichess
 * (AccuracyPercent.gameAccuracy): janelas deslizantes para pesos de
 * volatilidade, depois média de (média ponderada + média harmônica).
 *
 * As posições precisam ter evalCp/evalMate na perspectiva das brancas
 * (convenção do LB Assist Chess) e plies consecutivos a partir de 1.
 * A posição inicial (ply 0, eval 0cp) é inserida como wp0 = 50%.
 *
 * Retorna null se a cor não tiver lances analisados.
 */
function gameAccuracy(positions: PositionAnalysis[], color: 'w' | 'b'): number | null {
  // Coletar win% de todas as posições COM classificação e avaliação,
  // na perspectiva das brancas (convenção de armazenamento), em ordem de ply.
  // wp0 (posição inicial, 50%) é prependida conforme o Lichess (Cp.initial = 0).
  // Coletar (ply, cp) das posições COM classificação e avaliação,
  // na perspectiva das brancas (convenção de armazenamento), em ordem de ply.
  const plyCps: { ply: number; cp: number }[] = [];
  for (const pos of positions) {
    if (!pos.classification) continue;
    const cp = evalToCp({ cp: pos.evalCp, mate: pos.evalMate });
    if (cp === null) continue;
    plyCps.push({ ply: pos.ply, cp });
  }
  if (plyCps.length === 0) return null;

  // win% na perspectiva das BRANCAS, com wp0 = 50% (posição inicial).
  const allWinPercents = [evalToWinPercent(0), ...plyCps.map((p) => evalToWinPercent(p.cp))];
  // Plies alinhados com allWinPercents: allWinPercents[0] = posição inicial (ply 0),
  // allWinPercents[k] = resultado do lance em plyCps[k-1].ply.
  const allPlies = [0, ...plyCps.map((p) => p.ply)];

  // Determinar windowSize = clamp(cps.length / 10, 2, 8).
  const windowSize = Math.max(2, Math.min(8, Math.floor(cps.length / 10)));

  // Construir janelas conforme o Lichess:
  //   List.fill(min(windowSize, n) - 2)(allWinPercents.take(windowSize))
  //     ::: allWinPercents.sliding(windowSize)
  const n = allWinPercents.length;
  const windows: number[][] = [];
  const fillCount = Math.max(0, Math.min(windowSize, n) - 2);
  for (let i = 0; i < fillCount; i++) {
    windows.push(allWinPercents.slice(0, windowSize));
  }
  for (let i = 0; i + windowSize <= n; i++) {
    windows.push(allWinPercents.slice(i, i + windowSize));
  }

  // Peso de cada janela = clamp(stdev(janela), 0.5, 12).
  const weights = windows.map((w) => {
    const sd = standardDeviation(w);
    return Math.max(0.5, Math.min(12, sd));
  });

  // Para cada par consecutivo (wp[i], wp[i+1]), calcular acurácia do lance
  // na perspectiva da cor que jogou, com o peso da janela correspondente.
  // O índice i do par alinha-se com o índice da janela: pares e janelas são
  // ambos derivados da mesma lista allWinPercents, em ordem.
  //
  // color do lance i (0-indexed entre os pares):
  //   Lichess: Color.fromWhite((i % 2 == 0) == startColor.white)
  //   startColor = brancas (posição inicial). Então:
  //     i=0 → brancas, i=1 → pretas, i=2 → brancas, ...
  type AccEntry = { accuracy: number; weight: number; color: 'w' | 'b' };
  const entries: AccEntry[] = [];

  for (let i = 0; i < allWinPercents.length - 1; i++) {
    const wpPrev = allWinPercents[i];
    const wpNext = allWinPercents[i + 1];
    // Cor que jogou o lance entre wp[i] e wp[i+1]: o lado que tinha a vez
    // ANTES do lance. allPlies[i+1] é o ply do lance; quem joga nesse ply é
    // o lado que TEM a vez na posição resultante — o lado oposto jogou.
    const moveColor: 'w' | 'b' = getSideToMoveFromPly(allPlies[i + 1]);

    // win% na perspectiva da cor que jogou: brancas usam direto, pretas invertem.
    const wpBeforePlayer = moveColor === 'w' ? wpPrev : 100 - wpPrev;
    const wpAfterPlayer = moveColor === 'w' ? wpNext : 100 - wpNext;

    const accuracy = accuracyFromWinPercents(wpBeforePlayer, wpAfterPlayer);
    // Peso: janela correspondente ao índice i. O Lichess zips sliding(2)
    // com weights; se houver menos pesos que pares (pre-fill), usamos o
    // último peso disponível (janela mais próxima).
    const weight = weights[i] ?? weights[weights.length - 1] ?? 1;

    entries.push({ accuracy, weight, color: moveColor });
  }

  const colorEntries = entries.filter((e) => e.color === color);
  if (colorEntries.length === 0) return null;

  const weighted = weightedMean(
    colorEntries.map((e) => e.accuracy),
    colorEntries.map((e) => e.weight),
  );
  const harmonic = harmonicMean(colorEntries.map((e) => e.accuracy));

  const game = (weighted + harmonic) / 2;
  return Math.round(game);
}

/**
 * Desvio-padrão amostral (n-1) de uma lista de números.  Retorna 0 para
 * listas vazias ou de tamanho 1.
 */
function standardDeviation(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((acc, x) => acc + (x - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

/**
 * Média ponderada: sum(values[i] * weights[i]) / sum(weights).
 */
function weightedMean(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    num += values[i] * weights[i];
    den += weights[i];
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Média harmônica: n / sum(1/x).  Valores <= 0 são tratados como
 * desprezíveis (Lichess: orZero).  Retorna 0 se não houver valores válidos.
 */
function harmonicMean(values: number[]): number {
  const valid = values.filter((v) => v > 0);
  if (valid.length === 0) return 0;
  const sumInv = valid.reduce((acc, v) => acc + 1 / v, 0);
  return valid.length / sumInv;
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
