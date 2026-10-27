import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  detectGamePhase,
  generateExplanations,
  isBestMoveLegal,
  validatePlyFenAssociation,
  type MoveExplanation,
} from './explanations';
import type { PositionAnalysis } from './analysis';

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

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

// === detectGamePhase ===

describe('detectGamePhase', () => {
  it('posição inicial = abertura', () => {
    expect(detectGamePhase(START_FEN)).toBe('opening');
  });

  it('após 1.e4 = abertura', () => {
    expect(detectGamePhase(AFTER_E4)).toBe('opening');
  });

  it('final com poucas peças = endgame', () => {
    // Rei e torre vs rei
    const fen = '4k3/8/8/8/8/8/8/R3K3 w - - 0 1';
    expect(detectGamePhase(fen)).toBe('endgame');
  });

  it('meio-jogo com material moderado', () => {
    // Posição com peças mas sem ser abertura nem final
    const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 w kq - 6 6';
    const phase = detectGamePhase(fen);
    expect(['opening', 'middlegame']).toContain(phase);
  });

  it('FEN inválido retorna middlegame (fallback)', () => {
    expect(detectGamePhase('invalid fen')).toBe('middlegame');
  });
});

// === isBestMoveLegal ===

describe('isBestMoveLegal', () => {
  it('lance legal na posição inicial = true', () => {
    expect(isBestMoveLegal(START_FEN, 'e2e4')).toBe(true);
  });

  it('lance ilegal (sem peça) = false', () => {
    expect(isBestMoveLegal(START_FEN, 'e4e5')).toBe(false);
  });

  it('prevFen null = false', () => {
    expect(isBestMoveLegal(null, 'e2e4')).toBe(false);
  });

  it('bestMove null = false', () => {
    expect(isBestMoveLegal(START_FEN, null)).toBe(false);
  });
});

// === validatePlyFenAssociation ===

describe('validatePlyFenAssociation', () => {
  it('associação válida = sem erros', () => {
    const analysis: PositionAnalysis[] = [
      makePos(1, 30, null, 'best', AFTER_E4, 'e4'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: AFTER_E4, ply: 1, move: 'e4' },
    ];
    const result = validatePlyFenAssociation(analysis, board);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('lance ilegal na posição anterior = erro', () => {
    const analysis: PositionAnalysis[] = [
      makePos(1, 30, null, 'best', AFTER_E4, 'z9z9'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: AFTER_E4, ply: 1, move: 'e4' },
    ];
    const result = validatePlyFenAssociation(analysis, board);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('sem posição no tabuleiro = erro', () => {
    const analysis: PositionAnalysis[] = [
      makePos(99, 30, null, 'best'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
    ];
    const result = validatePlyFenAssociation(analysis, board);
    expect(result.valid).toBe(false);
  });
});

// === generateExplanations ===

describe('generateExplanations', () => {
  it('gera explicação para cada lance classificado', () => {
    const analysis: PositionAnalysis[] = [
      makePos(1, 30, null, 'best', AFTER_E4, 'e4', 'e2e4'),
      makePos(2, 10, null, 'good', '', 'e5', 'e7e5'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: AFTER_E4, ply: 1, move: 'e4' },
      { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', ply: 2, move: 'e5' },
    ];
    const explanations = generateExplanations(analysis, board);
    expect(explanations).toHaveLength(2);
    expect(explanations[0].ply).toBe(1);
    expect(explanations[1].ply).toBe(2);
    expect(explanations[0].classification).toBe('best');
    expect(explanations[1].classification).toBe('good');
  });

  it('lance best = explicação resumida (isDetailed=false)', () => {
    const analysis: PositionAnalysis[] = [
      makePos(1, 30, null, 'best', AFTER_E4, 'e4', 'e2e4'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: AFTER_E4, ply: 1, move: 'e4' },
    ];
    const exp = generateExplanations(analysis, board)[0];
    expect(exp.isDetailed).toBe(false);
    expect(exp.whatHappened).toContain('Brancas');
    expect(exp.whatHappened).toContain('e4');
  });

  it('blunder = explicação detalhada (isDetailed=true)', () => {
    const analysis: PositionAnalysis[] = [
      makePos(1, -300, null, 'blunder', '', 'b4', 'e2e4', 'e2e4 e7e5'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: 'rnbqkbnr/pppppppp/8/8/1P6/8/P1PPPPPP/RNBQKBNR b KQkq - 0 1', ply: 1, move: 'b4' },
    ];
    const exp = generateExplanations(analysis, board)[0];
    expect(exp.isDetailed).toBe(true);
    expect(exp.whyBetter).toContain('alternativa');
    expect(exp.howToThink.length).toBeGreaterThan(0);
    expect(exp.whatToStudy.length).toBeGreaterThan(0);
  });

  it('bestMove SAN é convertido corretamente', () => {
    const analysis: PositionAnalysis[] = [
      makePos(0, 0, null, null, START_FEN, null, 'e2e4'),
      makePos(1, 30, null, 'best', AFTER_E4, 'e4'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: AFTER_E4, ply: 1, move: 'e4' },
    ];
    const exp = generateExplanations(analysis, board)[0];
    expect(exp.bestMoveSan).toBe('e4');
  });

  it('variante principal é convertida para SAN', () => {
    const analysis: PositionAnalysis[] = [
      makePos(0, 0, null, null, START_FEN, null, 'e2e4', 'e2e4 e7e5 g1f3'),
      makePos(1, -300, null, 'blunder', '', 'b4'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: 'rnbqkbnr/pppppppp/8/8/1P6/8/P1PPPPPP/RNBQKBNR b KQkq - 0 1', ply: 1, move: 'b4' },
    ];
    const exp = generateExplanations(analysis, board)[0];
    expect(exp.pvSan).not.toBeNull();
    expect(exp.pvSan!.length).toBeGreaterThan(0);
    expect(exp.pvSan![0]).toContain('e4');
  });

  it('dados incompletos: sem prevFen = explicação com limites', () => {
    const analysis: PositionAnalysis[] = [
      makePos(1, -300, null, 'blunder', '', 'b4', null, null),
    ];
    const board: { fen: string; ply: number; move: string | null }[] = [];
    const exp = generateExplanations(analysis, board)[0];
    expect(exp.bestMoveSan).toBeNull();
    expect(exp.pvSan).toBeNull();
    expect(exp.isDetailed).toBe(false); // sem prevFen não pode ser detalhado
  });

  it('classificação null = sem explicação', () => {
    const analysis: PositionAnalysis[] = [
      makePos(1, 0, null, null, AFTER_E4, 'e4'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: AFTER_E4, ply: 1, move: 'e4' },
    ];
    const exp = generateExplanations(analysis, board);
    expect(exp).toHaveLength(0);
  });

  it('perda de avaliação é calculada na perspectiva do jogador', () => {
    // Brancas jogam, antes +100, depois -200 → perda 300 para brancas
    const analysis: PositionAnalysis[] = [
      makePos(0, 100, null, null, START_FEN, null),
      makePos(1, -200, null, 'blunder', '', 'Qb6', 'e2e4', 'e2e4'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1', ply: 1, move: 'Qb6' },
    ];
    const exp = generateExplanations(analysis, board)[0];
    // ply 1 = brancas jogaram, perda = 100 - (-200) = 300
    expect(exp.lossCp).toBe(300);
  });

  it('análise parcial: lances sem classificação são ignorados', () => {
    const analysis: PositionAnalysis[] = [
      makePos(1, 30, null, 'best', AFTER_E4, 'e4'),
      makePos(2, 0, null, null, '', 'e5'), // sem classificação
      makePos(3, -100, null, 'mistake', '', 'Nf6', 'e2e4'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: AFTER_E4, ply: 1, move: 'e4' },
      { fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2', ply: 2, move: 'e5' },
      { fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 3', ply: 3, move: 'Nf6' },
    ];
    const exp = generateExplanations(analysis, board);
    expect(exp).toHaveLength(2); // apenas ply 1 e ply 3
    expect(exp[0].ply).toBe(1);
    expect(exp[1].ply).toBe(3);
  });
});

// === Integração: consistência ply/FEN/lance ===

describe('Consistência: ply → FEN → lance → explicação', () => {
  it('cada explicação referencia o ply e FEN corretos', () => {
    const analysis: PositionAnalysis[] = [
      makePos(1, 30, null, 'best', AFTER_E4, 'e4', 'e2e4'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: AFTER_E4, ply: 1, move: 'e4' },
    ];
    const exp = generateExplanations(analysis, board)[0];
    expect(exp.ply).toBe(1);
    expect(exp.move).toBe('e4');
    expect(exp.moveSan).toBe('e4');
  });

  it('bestMove é legal na posição anterior', () => {
    const analysis: PositionAnalysis[] = [
      makePos(1, 30, null, 'best', AFTER_E4, 'e4', 'e2e4'),
    ];
    const board = [
      { fen: START_FEN, ply: 0, move: null },
      { fen: AFTER_E4, ply: 1, move: 'e4' },
    ];
    const exp = generateExplanations(analysis, board)[0];
    const prevBoard = board[0];
    // O bestMove original (UCI) deve ser legal no FEN anterior
    const bestMoveUci = analysis[0].bestMove;
    expect(isBestMoveLegal(prevBoard.fen, bestMoveUci)).toBe(true);
  });
});
