import { describe, it, expect } from 'vitest';
import {
  parsePgnFile,
  extractGameMoves,
  formatResult,
  detectUserColor,
} from './pgn';

const SAMPLE_PGN = `[Event "Casual Game"]
[Site "Chess.com"]
[Date "2024.05.01"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[ECO "C50"]
[Opening "Italian Game"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. Nc3 d6 6. O-O 1-0`;

const MULTIPLE_PGN = `${SAMPLE_PGN}

[Event "Casual Game 2"]
[Site "Lichess.org"]
[Date "2024.05.02"]
[White "Carol"]
[Black "Dave"]
[Result "0-1"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 0-1`;

describe('extractGameMoves', () => {
  it('extrai os lances na ordem correta', () => {
    const { moves } = extractGameMoves(SAMPLE_PGN);
    expect(moves).toEqual([
      'e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5',
      'd3', 'Nf6', 'Nc3', 'd6', 'O-O',
    ]);
  });

  it('gera uma posição por ply (inicial + uma após cada lance)', () => {
    const { positions } = extractGameMoves(SAMPLE_PGN);
    expect(positions).toHaveLength(12);
    expect(positions[0]).toEqual({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      move: null,
      ply: 0,
    });
    expect(positions[1].ply).toBe(1);
    expect(positions[1].move).toBe('e4');
    expect(positions[11].ply).toBe(11);
    expect(positions[11].move).toBe('O-O');
  });

  it('mantém os FENs sincronizados com a posição correspondente', () => {
    const { positions } = extractGameMoves(SAMPLE_PGN);
    expect(positions[1].fen).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    );
    expect(positions[2].fen).toBe(
      'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    );
  });
});

describe('parsePgnFile', () => {
  it('parseia uma única partida', () => {
    const result = parsePgnFile(SAMPLE_PGN);
    expect(result.total).toBe(1);
    expect(result.valid).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.games[0].whitePlayer).toBe('Alice');
    expect(result.games[0].blackPlayer).toBe('Bob');
    expect(result.games[0].result).toBe('1-0');
    expect(result.games[0].openingEco).toBe('C50');
    expect(result.games[0].openingName).toBe('Italian Game');
    expect(result.games[0].moves).toHaveLength(11);
  });

  it('parseia múltiplas partidas', () => {
    const result = parsePgnFile(MULTIPLE_PGN);
    expect(result.total).toBe(2);
    expect(result.valid).toBe(2);
    expect(result.games[0].whitePlayer).toBe('Alice');
    expect(result.games[1].whitePlayer).toBe('Carol');
    expect(result.games[1].result).toBe('0-1');
  });

  it('rejeita PGN inválido sem lances', () => {
    const result = parsePgnFile('[Event "x"]\n[White "A"]\n\ninvalid move list here');
    expect(result.valid).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it('extrai a data no formato ISO', () => {
    const result = parsePgnFile(SAMPLE_PGN);
    expect(result.games[0].playedAt).toBe('2024-05-01T12:00:00');
  });

  it('usa o externalId a partir do Link/Site', () => {
    const result = parsePgnFile(SAMPLE_PGN);
    expect(result.games[0].externalId).toBe('Chess.com');
  });
});

describe('formatResult', () => {
  it('mostra vitória quando o usuário joga as brancas e resulta 1-0', () => {
    expect(formatResult('1-0', 'white')).toEqual(
      expect.objectContaining({ label: 'Vitória' }),
    );
  });
  it('mostra derrota quando o usuário joga as brancas e resulta 0-1', () => {
    expect(formatResult('0-1', 'white')).toEqual(
      expect.objectContaining({ label: 'Derrota' }),
    );
  });
  it('mostra empate', () => {
    expect(formatResult('1/2-1/2', null).label).toBe('Empate');
  });
});

describe('detectUserColor', () => {
  it('detecta brancas pelo nome', () => {
    expect(detectUserColor({ whitePlayer: 'Alice', blackPlayer: 'Bob' }, 'alice')).toBe('white');
  });
  it('detecta pretas pelo nome', () => {
    expect(detectUserColor({ whitePlayer: 'Alice', blackPlayer: 'Bob' }, 'BOB')).toBe('black');
  });
  it('retorna null quando o nome não bate', () => {
    expect(detectUserColor({ whitePlayer: 'Alice', blackPlayer: 'Bob' }, 'eve')).toBeNull();
  });
});
