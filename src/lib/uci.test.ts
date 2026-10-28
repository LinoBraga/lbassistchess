import { describe, it, expect } from 'vitest';
import { parsePgnFile, extractGameMoves } from './pgn';
import { classifyMove, CLASSIFICATION_THRESHOLDS } from './analysis';

// Testes do protocolo UCI e do parser de info lines do Stockfish.
// Não inicializamos o motor real (WASM) — testamos a lógica de parsing
// e classificação que consome as mensagens UCI.

const SAMPLE_PGN = `[Event "Test"]
[White "A"]
[Black "B"]
[Date "2024.05.01"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`;

describe('Stockfish UCI handshake (simulado)', () => {
  it('extraindo lances produz sequência que o worker consegue analisar', () => {
    const { moves, positions } = extractGameMoves(SAMPLE_PGN);
    expect(moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
    // 1 posição inicial + 6 após lances = 7
    expect(positions).toHaveLength(7);
    // Cada posição tem FEN válido (com lado a jogar)
    for (const p of positions) {
      expect(p.fen.split(' ')[1]).toMatch(/^[wb]$/);
      expect(p.fen.split(' ').length).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('classifyMove (lógica UCI de avaliação)', () => {
  it('jogada igual à melhor linha = best', () => {
    // Antes: +50cp para as brancas, depois: +50cp (mesma avaliação) — brancas jogaram
    const cls = classifyMove({ cp: 50, mate: null }, { cp: 50, mate: null }, 'w');
    expect(cls).toBe('best');
  });

  it('perda de 40cp = good', () => {
    const cls = classifyMove({ cp: 100, mate: null }, { cp: 60, mate: null }, 'w');
    expect(cls).toBe('good');
  });

  it('perda de 60cp = inaccuracy', () => {
    const cls = classifyMove({ cp: 100, mate: null }, { cp: 40, mate: null }, 'w');
    expect(cls).toBe('inaccuracy');
  });

  it('perda de 120cp = mistake', () => {
    const cls = classifyMove({ cp: 100, mate: null }, { cp: -20, mate: null }, 'w');
    expect(cls).toBe('mistake');
  });

  it('perda de 350cp = blunder', () => {
    const cls = classifyMove({ cp: 100, mate: null }, { cp: -250, mate: null }, 'w');
    expect(cls).toBe('blunder');
  });

  it('pretas jogando: inverte a perspectiva', () => {
    // Pretas jogaram: antes -100 (pretas vantajosas), depois -100 ainda — best
    const cls = classifyMove({ cp: -100, mate: null }, { cp: -100, mate: null }, 'b');
    expect(cls).toBe('best');
  });

  it('mate positivo antes das brancas = best (mantém)', () => {
    const cls = classifyMove({ cp: null, mate: 5 }, { cp: null, mate: 3 }, 'w');
    expect(cls).toBe('best');
  });

  it('mate perdido = blunder', () => {
    const cls = classifyMove({ cp: null, mate: 5 }, { cp: null, mate: -5 }, 'w');
    expect(cls).toBe('blunder');
  });
});

describe('CLASSIFICATION_THRESHOLDS', () => {
  it('limites em ordem crescente', () => {
    expect(CLASSIFICATION_THRESHOLDS.excellent).toBeLessThan(CLASSIFICATION_THRESHOLDS.good);
    expect(CLASSIFICATION_THRESHOLDS.good).toBeLessThan(CLASSIFICATION_THRESHOLDS.inaccuracy);
    expect(CLASSIFICATION_THRESHOLDS.inaccuracy).toBeLessThan(CLASSIFICATION_THRESHOLDS.mistake);
    expect(CLASSIFICATION_THRESHOLDS.mistake).toBeLessThan(CLASSIFICATION_THRESHOLDS.blunder);
  });
});

describe('parsePgnFile com PGN de teste', () => {
  it('parseia e devolve lances em ordem', () => {
    const r = parsePgnFile(SAMPLE_PGN);
    expect(r.valid).toBe(1);
    expect(r.games[0].moves).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  });
});
