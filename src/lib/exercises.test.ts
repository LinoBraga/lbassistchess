import { describe, it, expect } from 'vitest';
import { generateExercises, checkMove, uciToSan } from './exercises';
import type { GameAnalysisData } from './diagnosis';
import type { PositionAnalysis } from './analysis';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const AFTER_B4 = 'rnbqkbnr/pppppppp/8/8/1P6/8/P1PPPPPP/RNBQKBNR b KQkq - 0 1';

function makePos(
  ply: number,
  evalCp: number | null,
  evalMate: number | null,
  classification: PositionAnalysis['classification'],
  fen = '',
  move: string | null = `m${ply}`,
  bestMove: string | null = null,
  pv: string | null = null,
): PositionAnalysis {
  return {
    ply,
    fen,
    move,
    bestMove,
    evalCp,
    evalMate,
    depth: 15,
    pv,
    classification,
  };
}

describe('generateExercises', () => {
  it('gera exercício a partir de blunder das brancas', () => {
    // Brancas jogam b4 (blunder). Posição anterior (ply 0) tem bestMove e2e4.
    const game: GameAnalysisData = {
      gameId: 'g1',
      playedAt: null,
      positions: [
        makePos(0, 0, null, null, START_FEN, null, 'e2e4', 'e2e4 e7e5'),
        makePos(1, -300, null, 'blunder', AFTER_B4, 'b4'),
      ],
      summary: { inaccuracies: 0, mistakes: 0, blunders: 1, accuracyWhite: null, accuracyBlack: null, totalMoves: 1 },
    };

    const exercises = generateExercises([game], 10);
    expect(exercises).toHaveLength(1);
    const ex = exercises[0];
    expect(ex.sourcePly).toBe(0); // posição ANTERIOR ao erro
    expect(ex.fen).toBe(START_FEN);
    expect(ex.sideToMove).toBe('w'); // brancas jogam na posição anterior
    expect(ex.bestMove).toBe('e2e4'); // bestMove da posição ANTERIOR
    expect(ex.category).toBe('abertura'); // ply 1 = abertura
    expect(ex.difficulty).toBe('dificil');
  });

  it('gera exercício a partir de erro das pretas', () => {
    // Pretas jogam erro na ply 2. Posição anterior (ply 1) tem bestMove.
    const afterBlackBlunder = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e3 0 1';
    const game: GameAnalysisData = {
      gameId: 'g2',
      playedAt: null,
      positions: [
        makePos(0, 0, null, null, START_FEN, null, 'e2e4'),
        makePos(1, 30, null, 'best', AFTER_E4, 'e4', 'e7e5'),
        makePos(2, -200, null, 'blunder', afterBlackBlunder, 'a6', 'e7e5'),
      ],
      summary: { inaccuracies: 0, mistakes: 0, blunders: 1, accuracyWhite: null, accuracyBlack: null, totalMoves: 2 },
    };

    const exercises = generateExercises([game], 10);
    expect(exercises).toHaveLength(1);
    const ex = exercises[0];
    expect(ex.sourcePly).toBe(1); // posição ANTERIOR (ply 1)
    expect(ex.sideToMove).toBe('b'); // pretas jogam na ply 1
    expect(ex.bestMove).toBe('e7e5'); // bestMove da posição ANTERIOR
    expect(ex.fen).toBe(AFTER_E4);
  });

  it('não gera exercício para lances best/excellent/good', () => {
    const game: GameAnalysisData = {
      gameId: 'g3',
      playedAt: null,
      positions: [
        makePos(0, 0, null, null, START_FEN, null, 'e2e4'),
        makePos(1, 30, null, 'best', AFTER_E4, 'e4'),
      ],
      summary: { inaccuracies: 0, mistakes: 0, blunders: 0, accuracyWhite: null, accuracyBlack: null, totalMoves: 1 },
    };
    const exercises = generateExercises([game], 10);
    expect(exercises).toHaveLength(0);
  });

  it('não gera exercício quando bestMove é null', () => {
    const game: GameAnalysisData = {
      gameId: 'g4',
      playedAt: null,
      positions: [
        makePos(0, 0, null, null, START_FEN, null, null),
        makePos(1, -300, null, 'blunder', AFTER_B4, 'b4'),
      ],
      summary: { inaccuracies: 0, mistakes: 0, blunders: 1, accuracyWhite: null, accuracyBlack: null, totalMoves: 1 },
    };
    const exercises = generateExercises([game], 10);
    expect(exercises).toHaveLength(0);
  });

  it('não gera exercício quando bestMove é ilegal na posição anterior', () => {
    const game: GameAnalysisData = {
      gameId: 'g5',
      playedAt: null,
      positions: [
        makePos(0, 0, null, null, START_FEN, null, 'h9h9'), // lance ilegal
        makePos(1, -300, null, 'blunder', AFTER_B4, 'b4'),
      ],
      summary: { inaccuracies: 0, mistakes: 0, blunders: 1, accuracyWhite: null, accuracyBlack: null, totalMoves: 1 },
    };
    const exercises = generateExercises([game], 10);
    expect(exercises).toHaveLength(0);
  });

  it('partida sem erros críticos não gera exercícios', () => {
    const game: GameAnalysisData = {
      gameId: 'g6',
      playedAt: null,
      positions: [
        makePos(0, 0, null, null, START_FEN, null, 'e2e4'),
        makePos(1, 10, null, 'best', AFTER_E4, 'e4', 'e7e5'),
        makePos(2, 0, null, 'best', 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', 'e5'),
      ],
      summary: { inaccuracies: 0, mistakes: 0, blunders: 0, accuracyWhite: null, accuracyBlack: null, totalMoves: 2 },
    };
    const exercises = generateExercises([game], 10);
    expect(exercises).toHaveLength(0);
  });

  it('não duplica exercícios para o mesmo (gameId, ply)', () => {
    const game: GameAnalysisData = {
      gameId: 'g7',
      playedAt: null,
      positions: [
        makePos(0, 0, null, null, START_FEN, null, 'e2e4'),
        makePos(1, -300, null, 'blunder', AFTER_B4, 'b4'),
      ],
      summary: { inaccuracies: 0, mistakes: 0, blunders: 1, accuracyWhite: null, accuracyBlack: null, totalMoves: 1 },
    };
    // Chamar duas vezes com o mesmo jogo
    const ex1 = generateExercises([game], 10);
    const ex2 = generateExercises([game], 10);
    expect(ex1).toHaveLength(1);
    expect(ex2).toHaveLength(1);
    expect(ex1[0].gameId).toBe(ex2[0].gameId);
    expect(ex1[0].sourcePly).toBe(ex2[0].sourcePly);
  });

  it('prioriza blunders sobre mistakes', () => {
    // 3 erros: inaccuracy (ply 1), mistake (ply 3), blunder (ply 5)
    // Cada erro tem uma posição anterior válida com bestMove legal
    const fenPly0 = START_FEN;
    const fenPly1 = AFTER_E4; // após e4, pretas jogam
    const fenPly2 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2'; // após e5, brancas jogam
    const fenPly3 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 1 2'; // após Nc3, pretas jogam
    const fenPly4 = 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3'; // após Nf6, brancas jogam
    const fenPly5 = 'r1bqkb1r/pppp1ppp/5n2/4p3/4P3/2N2P2/PPPP2PP/R1BQKBNR b KQkq - 0 4'; // após f3, pretas jogam

    const game: GameAnalysisData = {
      gameId: 'g8',
      playedAt: null,
      positions: [
        makePos(0, 0, null, null, fenPly0, null, 'e2e4'),
        makePos(1, -50, null, 'inaccuracy', fenPly1, 'e4', 'e7e5'),
        makePos(2, -100, null, 'best', fenPly2, 'e5', 'g1f3'),
        makePos(3, -200, null, 'mistake', fenPly3, 'Nc3', 'b8c6'),
        makePos(4, 0, null, 'best', fenPly4, 'Nf6', 'd2d4'),
        makePos(5, -500, null, 'blunder', fenPly5, 'f3', 'e7e5'),
      ],
      summary: { inaccuracies: 1, mistakes: 1, blunders: 1, accuracyWhite: null, accuracyBlack: null, totalMoves: 4 },
    };
    const exercises = generateExercises([game], 10);
    expect(exercises.length).toBe(3);
    // Blunder deve vir primeiro (severidade maior)
    expect(exercises[0].difficulty).toBe('dificil');
  });
});

describe('checkMove', () => {
  it('aceita o bestMove como correto', () => {
    const exercise = {
      gameId: 'g1',
      sourcePly: 0,
      fen: START_FEN,
      sideToMove: 'w' as const,
      bestMove: 'e2e4',
      acceptableMoves: [],
      pv: null,
      category: 'tatica' as never,
      difficulty: 'dificil' as never,
      instruction: '',
      explanation: '',
    };
    expect(checkMove(exercise, 'e2e4')).toBe(true);
  });

  it('rejeita lance incorreto', () => {
    const exercise = {
      gameId: 'g1',
      sourcePly: 0,
      fen: START_FEN,
      sideToMove: 'w' as const,
      bestMove: 'e2e4',
      acceptableMoves: [],
      pv: null,
      category: 'tatica' as never,
      difficulty: 'dificil' as never,
      instruction: '',
      explanation: '',
    };
    expect(checkMove(exercise, 'a2a3')).toBe(false);
  });

  it('aceita lance aceitável da lista', () => {
    const exercise = {
      gameId: 'g1',
      sourcePly: 0,
      fen: START_FEN,
      sideToMove: 'w' as const,
      bestMove: 'e2e4',
      acceptableMoves: ['d2d4'],
      pv: null,
      category: 'tatica' as never,
      difficulty: 'dificil' as never,
      instruction: '',
      explanation: '',
    };
    expect(checkMove(exercise, 'd2d4')).toBe(true);
  });
});

describe('uciToSan', () => {
  it('converte e2e4 para e4 na posição inicial', () => {
    expect(uciToSan(START_FEN, 'e2e4')).toBe('e4');
  });

  it('converte g1f3 para Nf3 na posição inicial', () => {
    expect(uciToSan(START_FEN, 'g1f3')).toBe('Nf3');
  });

  it('retorna null para lance ilegal', () => {
    expect(uciToSan(START_FEN, 'e4e5')).toBeNull();
  });
});
