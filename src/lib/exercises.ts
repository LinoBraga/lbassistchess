import { Chess } from 'chess.js';
import type { PositionAnalysis } from '@/lib/analysis';
import type { GameAnalysisData, WeaknessCategory } from '@/lib/diagnosis';

export interface GeneratedExercise {
  gameId: string;
  sourcePly: number;
  fen: string;
  sideToMove: 'w' | 'b';
  bestMove: string | null;
  acceptableMoves: string[];
  pv: string | null;
  category: WeaknessCategory;
  difficulty: 'facil' | 'medio' | 'dificil';
  instruction: string;
  explanation: string;
}

/**
 * Gera exercícios a partir de posições onde o usuário cometeu erros.
 * O exercício apresenta a posição ANTERIOR ao erro — o usuário deve
 * encontrar o melhor lance que ele não jogou.
 *
 * Validação: o usuário deve jogar o bestMove ou um lance aceitável
 * (equivalente em avaliação). Como não temos MultiPV na análise atual,
 * aceitamos apenas o bestMove como correto. Se houver dados insuficientes
 * para validar, o exercício não é marcado como validado.
 */
export function generateExercises(
  games: GameAnalysisData[],
  limit: number = 20,
): GeneratedExercise[] {
  const exercises: GeneratedExercise[] = [];
  const seen = new Set<string>();
  const seenPositions = new Set<string>();
  // Priorizar blunders > mistakes > inaccuracies
  const allErrors = games.flatMap((game) =>
    game.positions
      .filter((p) =>
        p.classification === 'blunder' ||
        p.classification === 'mistake' ||
        p.classification === 'inaccuracy'
      )
      .map((p) => ({ game, position: p })),
  );

  // Ordenar por severidade: blunders primeiro
  const severityOrder = { blunder: 3, mistake: 2, inaccuracy: 1 };
  allErrors.sort((a, b) =>
    (severityOrder[b.position.classification as keyof typeof severityOrder] ?? 0) -
    (severityOrder[a.position.classification as keyof typeof severityOrder] ?? 0),
  );

  for (const { game, position } of allErrors) {
    if (exercises.length >= limit) break;
    const key = `${game.gameId}-${position.ply}`;
    if (seen.has(key)) continue;
    if (!position.classification) continue;

    // Pegar a posição ANTERIOR ao erro (onde o usuário deveria ter jogado)
    const previousPosition = game.positions.find((p) => p.ply === position.ply - 1);
    if (!previousPosition) continue;

    // O bestMove virá da posição ANTERIOR, não da posição do erro
    if (!previousPosition.bestMove) continue;
    const chess = new Chess(previousPosition.fen);

    // Ignora contadores de lances, mantendo turno, roque e en passant.
    const positionKey = chess.fen().split(' ').slice(0, 4).join(' ');

    if (seenPositions.has(positionKey)) continue;
    const exercise = buildExercise(game, previousPosition, position);
    if (exercise) {
      seen.add(key);
      seenPositions.add(positionKey);
      exercises.push(exercise);
    }
  }

  return exercises;
}

function buildExercise(
  game: GameAnalysisData,
  position: PositionAnalysis,
  errorPosition: PositionAnalysis,
): GeneratedExercise | null {
  try {
    const chess = new Chess(position.fen);
    const sideToMove = chess.turn() === 'w' ? 'w' : 'b';

    // O melhor lance é o bestMove da análise da posição ANTERIOR ao erro
    // (a posição que o usuário deveria ter jogado, não a posição resultante)
    const bestMove = position.bestMove;

    // Converter para UCI se necessário (chess.js aceita SAN e UCI)
    // O bestMove do Stockfish vem em UCI (ex: e2e4)
    // Verificar se é legal na posição ANTERIOR ao erro
    let moveVerified = false;
    if (bestMove) {
      try {
        const testChess = new Chess(position.fen);
        testChess.move({ from: bestMove.slice(0, 2), to: bestMove.slice(2, 4) });
        moveVerified = true;
      } catch {
        // Tentar como SAN
        try {
          const testChess = new Chess(position.fen);
          testChess.move(bestMove);
          moveVerified = true;
        } catch {
          moveVerified = false;
        }
      }
    }

    if (!moveVerified || !bestMove) return null;

    const category = categorizeForExercise(errorPosition, game.positions.length);
    const difficulty = determineDifficulty(errorPosition.classification);

    const instruction = buildInstruction(category, sideToMove);
    const explanation = buildExplanation(errorPosition, position);

    return {
      gameId: game.gameId,
      sourcePly: position.ply,
      fen: position.fen,
      sideToMove,
      bestMove,
      acceptableMoves: [],
      pv: position.pv,
      category,
      difficulty,
      instruction,
      explanation,
    };
  } catch {
    return null;
  }
}

function categorizeForExercise(pos: PositionAnalysis, totalPlies: number): WeaknessCategory {
  // Reutilizar a mesma lógica do diagnóstico
  const phase = pos.ply <= 10 ? 'opening' : pos.ply >= totalPlies * 0.75 ? 'endgame' : 'middlegame';
  if (phase === 'opening') return 'abertura';
  if (phase === 'endgame') return 'finais';
  if (pos.evalMate !== null) return 'tatica';
  if (pos.classification === 'blunder') return 'tatica';
  if (pos.classification === 'mistake') return 'calculo';
  return 'estrategia';
}

function determineDifficulty(classification: string | null): 'facil' | 'medio' | 'dificil' {
  switch (classification) {
    case 'inaccuracy': return 'facil';
    case 'mistake': return 'medio';
    case 'blunder': return 'dificil';
    default: return 'medio';
  }
}

function buildInstruction(category: WeaknessCategory, side: 'w' | 'b'): string {
  const sideLabel = side === 'w' ? 'Brancas' : 'Pretas';
  const base = `Encontre o melhor lance para as ${sideLabel}.`;

  const categoryInstructions: Partial<Record<WeaknessCategory, string>> = {
    tatica: 'Procure uma sequência tática forçada.',
    calculo: 'Calcule as consequências de cada lance candidato.',
    abertura: 'Considere os princípios de abertura.',
    estrategia: 'Identifique o plano posicional correto.',
    finais: 'Aplique a técnica de finais correta.',
  };

  const extra = categoryInstructions[category];
  return extra ? `${base} ${extra}` : base;
}

function buildExplanation(errorPos: PositionAnalysis, position: PositionAnalysis): string {
  const playedMove = errorPos.move ?? 'o lance jogado';
  const bestMove = position.bestMove ?? 'o melhor lance';
  const classification = errorPos.classification ?? '';

  let evalInfo = '';
  if (errorPos.evalCp !== null) {
    const pawns = (errorPos.evalCp / 100).toFixed(1);
    evalInfo = `A avaliação após o lance jogado foi ${errorPos.evalCp >= 0 ? '+' : ''}${pawns} peões.`;
  } else if (errorPos.evalMate !== null) {
    evalInfo = `A posição resultou em mate em ${Math.abs(errorPos.evalMate)} lance(s).`;
  }

  const classificationInfo = {
    inaccuracy: 'Uma imprecisão — uma pequena perda de vantagem.',
    mistake: 'Um erro — uma perda significativa de vantagem.',
    blunder: 'Um erro grave — uma grande perda de vantagem.',
  }[classification as string] ?? '';

  return `O melhor lance era ${bestMove}, mas ${playedMove} foi jogado. ${classificationInfo} ${evalInfo}`.trim();
}

/**
 * Verifica se o lance jogado pelo usuário é correto.
 * No momento, apenas o bestMove é aceito (sem MultiPV para validar alternativas).
 */
export function checkMove(
  exercise: GeneratedExercise,
  moveUci: string,
): boolean {
  // Normalizar para comparação
  const normalize = (m: string) => m.toLowerCase().replace(/[\+#]/g, '');

  if (normalize(exercise.bestMove ?? '') === normalize(moveUci)) return true;

  // Verificar lances aceitáveis
  for (const acceptable of exercise.acceptableMoves) {
    if (normalize(acceptable) === normalize(moveUci)) return true;
  }

  // Tentar validar com chess.js: se o lance é legal e resulta em avaliação similar
  // Sem MultiPV, não podemos fazer isso de forma confiável
  return false;
}

/**
 * Converte um lance de UCI para SAN usando chess.js.
 */
export function uciToSan(fen: string, uci: string): string | null {
  try {
    const chess = new Chess(fen);
    const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined });
    return move.san;
  } catch {
    // Tentar como SAN
    try {
      const chess = new Chess(fen);
      const move = chess.move(uci);
      return move.san;
    } catch {
      return null;
    }
  }
}
