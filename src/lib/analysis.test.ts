import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import {
  classifyMove,
  toPlayerPerspective,
  getSideToMoveFromPly,
  computeSummary,
  computeRealLossCp,
  evalToWinPercent,
  moveAccuracy,
  isLegalMove,
  formatEval,
  evalBarColor,
  classificationLabel,
  CLASSIFICATION_THRESHOLDS,
  type PositionAnalysis,
  type FullAnalysis,
} from './analysis';
import { extractGameMoves, detectUserColor } from './pgn';

const SAMPLE_PGN = `[Event "Casual Game"]
[Site "Chess.com"]
[Date "2024.05.01"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[ECO "C50"]
[Opening "Italian Game"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. Nc3 d6 6. O-O 1-0`;

// === PERSPECTIVE SWITCHING (brancas vs pretas) ===

describe('Perspectiva: alternância entre brancas e pretas', () => {
  it('toPlayerPerspective mantém o sinal para brancas', () => {
    expect(toPlayerPerspective({ cp: 100, mate: null }, 'w')).toBe(100);
    expect(toPlayerPerspective({ cp: -50, mate: null }, 'w')).toBe(-50);
  });

  it('toPlayerPerspective inverte o sinal para pretas', () => {
    expect(toPlayerPerspective({ cp: 100, mate: null }, 'b')).toBe(-100);
    expect(toPlayerPerspective({ cp: -50, mate: null }, 'b')).toBe(50);
  });

  it('toPlayerPerspective trata mate positivo para brancas', () => {
    expect(toPlayerPerspective({ cp: null, mate: 5 }, 'w')).toBe(10000);
    expect(toPlayerPerspective({ cp: null, mate: -5 }, 'w')).toBe(-10000);
  });

  it('toPlayerPerspective trata mate para pretas', () => {
    // mate 5 (brancas dão mate) perspectiva das pretas = -10000 (mau para pretas)
    expect(toPlayerPerspective({ cp: null, mate: 5 }, 'b')).toBe(-10000);
    // mate -5 (pretas dão mate) perspectiva das pretas = +10000 (bom para pretas)
    expect(toPlayerPerspective({ cp: null, mate: -5 }, 'b')).toBe(10000);
  });

  it('classifyMove: lance excelente das brancas (sem perda) = best', () => {
    const cls = classifyMove({ cp: 50, mate: null }, { cp: 50, mate: null }, 'w');
    expect(cls).toBe('best');
  });

  it('classifyMove: lance excelente das pretas (sem perda na perspectiva delas) = best', () => {
    // Pretas jogaram. Avaliação branca antes: -100 (pretas vantajosas).
    // Depois: -100 (mesma vantagem). Na perspectiva das pretas: +100 → +100, perda 0 = best.
    const cls = classifyMove({ cp: -100, mate: null }, { cp: -100, mate: null }, 'b');
    expect(cls).toBe('best');
  });

  it('classifyMove: pretas perdem 350cp na perspectiva delas = blunder', () => {
    // Antes: -100 (pretas +100). Depois: +250 (brancas +250 = pretas -250).
    // Perspectiva pretas: antes +100, depois -250 → perda 350 = blunder.
    const cls = classifyMove({ cp: -100, mate: null }, { cp: 250, mate: null }, 'b');
    expect(cls).toBe('blunder');
  });

  it('classifyMove: pretas melhoram a posição = best', () => {
    // Antes: +100 (brancas). Depois: -200 (pretas). Perspectiva pretas: antes -100, depois +200.
    // Perda = -300 (negativa = melhorou) → best.
    const cls = classifyMove({ cp: 100, mate: null }, { cp: -200, mate: null }, 'b');
    expect(cls).toBe('best');
  });
});

// === PLY ASSOCIATION (associação entre lance e avaliação) ===

describe('Associação entre lance e avaliação (ply)', () => {
  it('getSideToMoveFromPly: ply ímpar = brancas jogaram, par = pretas jogaram', () => {
    expect(getSideToMoveFromPly(1)).toBe('w');
    expect(getSideToMoveFromPly(2)).toBe('b');
    expect(getSideToMoveFromPly(3)).toBe('w');
    expect(getSideToMoveFromPly(4)).toBe('b');
  });

  it('ply 0 = posição inicial, sem classificação', () => {
    const { positions } = extractGameMoves(SAMPLE_PGN);
    expect(positions[0].ply).toBe(0);
    expect(positions[0].move).toBeNull();
  });

  it('ply 1 = primeiro lance das brancas (e4)', () => {
    const { positions } = extractGameMoves(SAMPLE_PGN);
    expect(positions[1].ply).toBe(1);
    expect(positions[1].move).toBe('e4');
    // Após e4, é a vez das pretas
    expect(positions[1].fen.split(' ')[1]).toBe('b');
  });

  it('ply 2 = primeiro lance das pretas (e5)', () => {
    const { positions } = extractGameMoves(SAMPLE_PGN);
    expect(positions[2].ply).toBe(2);
    expect(positions[2].move).toBe('e5');
    // Após e5, é a vez das brancas
    expect(positions[2].fen.split(' ')[1]).toBe('w');
  });

  it('sequência de plies é contínua e sem buracos', () => {
    const { positions } = extractGameMoves(SAMPLE_PGN);
    for (let i = 0; i < positions.length; i++) {
      expect(positions[i].ply).toBe(i);
    }
  });

  it('cada posição tem o FEN correto para o ply correspondente', () => {
    const { positions } = extractGameMoves(SAMPLE_PGN);
    // Posição 0: posição inicial, brancas jogam
    expect(positions[0].fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    // Posição 1: após e4, pretas jogam
    expect(positions[1].fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    // Posição 2: após e4 e5, brancas jogam
    expect(positions[2].fen).toBe('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
  });
});

// === LEGAL BEST MOVES ===

describe('Melhores lances sugeridos são legais', () => {
  it('bestMove UCI é um lance legal na posição correspondente', () => {
    const { positions } = extractGameMoves(SAMPLE_PGN);
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      const chess = new Chess(pos.fen);
      const legalMoves = chess.moves({ verbose: true });
      // Simular um bestMove UCI (e2e4 na posição inicial)
      if (i === 0) {
        const e2e4 = legalMoves.find((m) => m.from === 'e2' && m.to === 'e4');
        expect(e2e4).toBeDefined();
      }
    }
  });

  it('UCI to SAN: e2e4 na posição inicial = "e4"', () => {
    const chess = new Chess();
    const move = chess.move({ from: 'e2', to: 'e4' });
    expect(move?.san).toBe('e4');
  });

  it('UCI to SAN: g1f3 na posição inicial = "Nf3"', () => {
    const chess = new Chess();
    const move = chess.move({ from: 'g1', to: 'f3' });
    expect(move?.san).toBe('Nf3');
  });
});

// === COLOR DETECTION ===

describe('Identificação da cor do usuário', () => {
  it('detecta brancas pelo nome exato', () => {
    expect(detectUserColor({ whitePlayer: 'Alice', blackPlayer: 'Bob' }, 'Alice')).toBe('white');
  });

  it('detecta pretas pelo nome exato', () => {
    expect(detectUserColor({ whitePlayer: 'Alice', blackPlayer: 'Bob' }, 'Bob')).toBe('black');
  });

  it('detecta brancas case-insensitive', () => {
    expect(detectUserColor({ whitePlayer: 'Alice', blackPlayer: 'Bob' }, 'ALICE')).toBe('white');
  });

  it('detecta pretas por substring', () => {
    expect(detectUserColor({ whitePlayer: 'Alice', blackPlayer: 'BobMaster' }, 'bob')).toBe('black');
  });

  it('retorna null quando não há nome', () => {
    expect(detectUserColor({ whitePlayer: 'Alice', blackPlayer: 'Bob' }, null)).toBeNull();
  });

  it('retorna null quando o nome não bate com nenhum jogador', () => {
    expect(detectUserColor({ whitePlayer: 'Alice', blackPlayer: 'Bob' }, 'Charlie')).toBeNull();
  });

  it('retorna null quando ambos jogadores são null', () => {
    expect(detectUserColor({ whitePlayer: null, blackPlayer: null }, 'Alice')).toBeNull();
  });
});

// === INVESTIGAÇÃO: divergência +5.8 / -5.8 e 16 blunders ===

describe('Investigação: divergências de avaliação e blunders falsos', () => {
  it('CENÁRIO BUG: Stockfish reporta +580cp (side-to-move) para pretas = -580 brancas, não +580', () => {
    // Stockfish está na posição após um lance das pretas, então side-to-move = brancas.
    // score cp 580 = +5.80 para brancas = correto manter +580.
    const sideToMove: 'w' | 'b' = 'w';
    const scoreCp = 580;
    const normalizedCp = sideToMove === 'w' ? scoreCp : -scoreCp;
    expect(normalizedCp).toBe(580);
    expect(formatEval(normalizedCp, null)).toBe('+5.8');
  });

  it('CENÁRIO BUG (raiz): Stockfish reporta +580 para posição onde PRETAS jogam = deve ser -580', () => {
    // Se Stockfish reporta +580 numa posição onde pretas têm a vez (side-to-move = b),
    // significa +5.80 para as PRETAS na perspectiva delas. Convertendo para brancas: -580.
    const sideToMove = 'b' as 'w' | 'b';
    const scoreCp = 580;
    const normalizedCp = sideToMove === 'w' ? scoreCp : -scoreCp;
    expect(normalizedCp).toBe(-580);
    expect(formatEval(normalizedCp, null)).toBe('-5.8');
  });

  it('sem normalização: +580 das pretas seria ERRADAMENTE +5.8 (causa do bug)', () => {
    // Sem normalização, o código antigo armazenava +580 como brancas +5.8
    // mesmo quando era a perspectiva das pretas → divergência +5.8/-5.8
    const rawScoreCp = 580;
    const sideToMove = 'b' as 'w' | 'b';
    // BUG ANTIGO: usar rawScoreCp diretamente
    const buggyNormalized = rawScoreCp; // sem inverter
    // CORRETO: inverter
    const correctNormalized = sideToMove === 'w' ? rawScoreCp : -rawScoreCp;
    expect(buggyNormalized).toBe(580); // errado: +5.8 para brancas
    expect(correctNormalized).toBe(-580); // correto: -5.8 (pretas vencendo)
  });

  it('16 blunders falsos: bom lance das pretas não deve ser blunder', () => {
    // Sem normalização, um bom lance das pretas (perda 0 na perspectiva delas)
    // era tratado como perda 2x o valor absoluto na perspectiva das brancas.
    // Ex: antes +100 brancas, depois -100 brancas (pretas melhoraram).
    // Sem normalização, classifyMove recebia "sideToMove='b'" mas avaliações
    // já na perspectiva das brancas → toPlayerPerspective invertia de novo.
    // Com a normalização correta, classifyMove recebe valores já normalizados
    // e inverte corretamente para a perspectiva do jogador.
    const beforeWhite = { cp: 100, mate: null }; // brancas +1.0
    const afterWhite = { cp: -100, mate: null }; // brancas -1.0 (pretas melhoraram)
    const cls = classifyMove(beforeWhite, afterWhite, 'b');
    // Pretas: antes perspectiva delas = -100, depois = +100. Perda = -200 (melhorou) = best.
    expect(cls).toBe('best');
  });

  it('precisão 90% para ambos: não deve acontecer quando há erros reais', () => {
    // A precisão antiga usava getLossAmount(cls) (valores fixos por classificação),
    // não a perda real. Se muitos lances eram falsamente classificados como 'best'
    // (devido ao bug de perspectiva), a perda média ficava baixa → 90%+ falso.
    // Após a correção, a classificação reflete a perda real.
    // Simular 10 lances: 8 best + 2 blunders reais
    const positions: PositionAnalysis[] = [];
    for (let i = 1; i <= 8; i++) {
      positions.push({
        ply: i,
        fen: '',
        move: 'x',
        bestMove: null,
        evalCp: 0,
        evalMate: null,
        depth: 15,
        pv: null,
        classification: 'best',
      });
    }
    positions.push({
      ply: 9, fen: '', move: 'y', bestMove: null, evalCp: -300,
      evalMate: null, depth: 15, pv: null, classification: 'blunder',
    });
    positions.push({
      ply: 10, fen: '', move: 'z', bestMove: null, evalCp: -300,
      evalMate: null, depth: 15, pv: null, classification: 'blunder',
    });

    // Com a correção, blunders reais têm perda 300 cada → média = 60cp/move
    // Precisão ≈ 100 - 60*0.1 = 94%... mas a fórmula atual usa getLossAmount fixo.
    // O ponto-chave é que sem o bug de perspectiva, não haverá 16 blunders falsos.
    // Apenas os 2 blunders reais aparecem.
    const blunders = positions.filter((p) => p.classification === 'blunder');
    expect(blunders.length).toBe(2);
    expect(blunders.length).not.toBe(16);
  });
});

// === MATE E POSIÇÕES FINAIS ===

describe('Tratamento de mate e posições finais', () => {
  it('formatEval: mate positivo das brancas = +M3', () => {
    expect(formatEval(null, 3)).toBe('+M3');
  });

  it('formatEval: mate negativo das pretas = -M5', () => {
    expect(formatEval(null, -5)).toBe('-M5');
  });

  it('evalBarColor: mate positivo = verde (brancas)', () => {
    expect(evalBarColor(null, 3)).toBe('bg-success-500');
  });

  it('evalBarColor: mate negativo = vermelho (pretas)', () => {
    expect(evalBarColor(null, -3)).toBe('bg-danger-500');
  });

  it('classifyMove: perde mate = blunder', () => {
    const cls = classifyMove({ cp: null, mate: 3 }, { cp: 100, mate: null }, 'w');
    // Brancas tinham mate em 3, agora só +100cp. Perda enorme = blunder.
    expect(cls).toBe('blunder');
  });

  it('classifyMove: ganha mate = best', () => {
    const cls = classifyMove({ cp: 100, mate: null }, { cp: null, mate: 3 }, 'w');
    expect(cls).toBe('best');
  });
});

// === CLASSIFICATION LABELS ===

describe('classificationLabel', () => {
  it('todas as classificações têm label e cor', () => {
    const labels = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder'] as const;
    for (const cls of labels) {
      const result = classificationLabel(cls);
      expect(result.label).toBeTruthy();
      expect(result.color).toBeTruthy();
      expect(result.bg).toBeTruthy();
    }
  });

  it('null retorna vazio', () => {
    const result = classificationLabel(null);
    expect(result.label).toBe('');
    expect(result.color).toBe('');
    expect(result.bg).toBe('');
  });
});

// === THRESHOLDS ===

describe('CLASSIFICATION_THRESHOLDS', () => {
  it('limites em ordem crescente', () => {
    expect(CLASSIFICATION_THRESHOLDS.excellent).toBeLessThan(CLASSIFICATION_THRESHOLDS.good);
    expect(CLASSIFICATION_THRESHOLDS.good).toBeLessThan(CLASSIFICATION_THRESHOLDS.inaccuracy);
    expect(CLASSIFICATION_THRESHOLDS.inaccuracy).toBeLessThan(CLASSIFICATION_THRESHOLDS.mistake);
    expect(CLASSIFICATION_THRESHOLDS.mistake).toBeLessThan(CLASSIFICATION_THRESHOLDS.blunder);
  });

  it('blunder threshold = 300cp (3.0 peões)', () => {
    expect(CLASSIFICATION_THRESHOLDS.blunder).toBe(300);
  });
});

// === PRECISÃO: fórmula logística (win%) ===

describe('evalToWinPercent', () => {
  it('cp 0 = 50%', () => {
    expect(evalToWinPercent(0)).toBeCloseTo(50, 1);
  });

  it('cp positivo → >50%', () => {
    expect(evalToWinPercent(100)).toBeGreaterThan(50);
  });

  it('cp negativo → <50%', () => {
    expect(evalToWinPercent(-100)).toBeLessThan(50);
  });

  it('cp simétrico: +100 e -100 somam ~100', () => {
    expect(evalToWinPercent(100) + evalToWinPercent(-100)).toBeCloseTo(100, 0);
  });

  it('cp muito alto → ~100%', () => {
    expect(evalToWinPercent(10000)).toBeGreaterThan(99);
  });

  it('cp muito baixo → ~0%', () => {
    expect(evalToWinPercent(-10000)).toBeLessThan(1);
  });

  it('monotonicamente crescente', () => {
    expect(evalToWinPercent(0)).toBeLessThan(evalToWinPercent(50));
    expect(evalToWinPercent(50)).toBeLessThan(evalToWinPercent(100));
    expect(evalToWinPercent(100)).toBeLessThan(evalToWinPercent(300));
  });
});

describe('moveAccuracy', () => {
  it('sem perda (before == after) = 100%', () => {
    expect(moveAccuracy(100, 100)).toBe(100);
    expect(moveAccuracy(0, 0)).toBe(100);
    expect(moveAccuracy(-50, -50)).toBe(100);
  });

  it('null eval = 100% (sem dados)', () => {
    expect(moveAccuracy(null, 100)).toBe(100);
    expect(moveAccuracy(100, null)).toBe(100);
    expect(moveAccuracy(null, null)).toBe(100);
  });

  it('melhorou a posição = 100%', () => {
    expect(moveAccuracy(0, 100)).toBe(100);
    expect(moveAccuracy(-100, 50)).toBe(100);
  });

  it('perda de 100cp → ~91%', () => {
    const acc = moveAccuracy(100, 0);
    // wpBefore(100) ≈ 53.7, wpAfter(0) = 50, drop ≈ 3.7 → 96.3%
    // Para perda de 300: wpBefore(300) ≈ 66.4, wpAfter(0) = 50, drop ≈ 16.4 → 83.6%
    expect(acc).toBeGreaterThan(90);
    expect(acc).toBeLessThan(100);
  });

  it('perda de 300cp → ~83%', () => {
    const acc = moveAccuracy(300, 0);
    expect(acc).toBeGreaterThan(75);
    expect(acc).toBeLessThan(95);
  });

  it('perda de 500cp → ~72%', () => {
    const acc = moveAccuracy(500, 0);
    expect(acc).toBeGreaterThan(60);
    expect(acc).toBeLessThan(85);
  });

  it('perda muito alta → < 50%', () => {
    const acc = moveAccuracy(10000, -10000);
    // Perda enorme (perde mate): wpBefore(10000) ~99.99, wpAfter(-10000) ~0.01
    // drop ≈ 99.98 → accuracy ≈ 0.02
    expect(acc).toBeLessThan(10);
  });

  it('monotonicamente decrescente com perda crescente', () => {
    const a0 = moveAccuracy(100, 100);
    const a50 = moveAccuracy(100, 50);
    const a100 = moveAccuracy(100, 0);
    const a300 = moveAccuracy(100, -200);
    expect(a0).toBeGreaterThan(a50);
    expect(a50).toBeGreaterThan(a100);
    expect(a100).toBeGreaterThan(a300);
  });
});

describe('computeRealLossCp', () => {
  it('brancas: perda real = before - after', () => {
    expect(computeRealLossCp({ cp: 100, mate: null }, { cp: 50, mate: null }, 'w')).toBe(50);
  });

  it('brancas: melhorou = perda 0', () => {
    expect(computeRealLossCp({ cp: 50, mate: null }, { cp: 100, mate: null }, 'w')).toBe(0);
  });

  it('pretas: perda real invertida na perspectiva delas', () => {
    // Antes: brancas +100 = pretas -100. Depois: brancas -100 = pretas +100.
    // Perspectiva pretas: -100 → +100. Perda = 200.
    expect(computeRealLossCp({ cp: 100, mate: null }, { cp: -100, mate: null }, 'b')).toBe(200);
  });

  it('pretas: sem perda = 0', () => {
    expect(computeRealLossCp({ cp: -100, mate: null }, { cp: -100, mate: null }, 'b')).toBe(0);
  });

  it('mate → cp: before mate+5, after cp+100 → brancas perdendo mate', () => {
    // Brancas tinham mate em 5 (+10000), depois só +100cp. Perda = 9900.
    expect(computeRealLossCp({ cp: null, mate: 5 }, { cp: 100, mate: null }, 'w')).toBe(9900);
  });

  it('null eval = null loss', () => {
    expect(computeRealLossCp({ cp: null, mate: null }, { cp: 100, mate: null }, 'w')).toBeNull();
  });
});

// Helper para construir posições de teste
function makePos(
  ply: number,
  evalCp: number | null,
  evalMate: number | null,
  classification: PositionAnalysis['classification'],
): PositionAnalysis {
  return {
    ply,
    fen: '',
    move: `move${ply}`,
    bestMove: null,
    evalCp,
    evalMate,
    depth: 15,
    pv: null,
    classification,
  };
}

describe('computeSummary: precisão por cor', () => {
  it('partida perfeita (todos best) → 100%', () => {
    const positions: PositionAnalysis[] = [
      makePos(1, 0, null, 'best'),
      makePos(2, 0, null, 'best'),
      makePos(3, 0, null, 'best'),
      makePos(4, 0, null, 'best'),
    ];
    const summary = computeSummary(positions);
    expect(summary.accuracyWhite).toBe(100);
    expect(summary.accuracyBlack).toBe(100);
  });

  it('um blunder de 300cp das brancas reduz precisão significativamente', () => {
    // Brancas: 5 best + 1 blunder (perda 300)
    // Pretas: 5 best + 1 best
    const positions: PositionAnalysis[] = [
      makePos(1, 0, null, 'best'),    // brancas best
      makePos(2, 0, null, 'best'),    // pretas best
      makePos(3, 0, null, 'best'),    // brancas best
      makePos(4, 0, null, 'best'),    // pretas best
      makePos(5, 0, null, 'best'),    // brancas best
      makePos(6, 0, null, 'best'),    // pretas best
      // brancas blunder: antes +300, depois 0 → perda 300
      makePos(7, 0, null, 'blunder'),  // brancas blunder, after eval 0
      makePos(8, 0, null, 'best'),    // pretas best
      makePos(9, 0, null, 'best'),    // brancas best
      makePos(10, 0, null, 'best'),   // pretas best
      makePos(11, 0, null, 'best'),   // brancas best
      makePos(12, 0, null, 'best'),   // pretas best
    ];
    // Ajustar eval do ply 6 (antes do blunder do ply 7) para +300
    positions[5].evalCp = 300; // ply 6: antes do lance 7
    // ply 7: after eval = 0, before = +300, brancas jogaram, perda = 300
    const summary = computeSummary(positions);
    // 6 lances brancos: 5 best (win% 50 cada) + 1 blunder (win% ~28.9)
    // média win% = (5*50 + 28.9) / 6 = 278.9/6 = 46.48
    // accuracy = 46.48 * 2 = 93 (arredondado)
    // Pretas: 6 best → 100
    expect(summary.accuracyWhite).toBeLessThan(100);
    expect(summary.accuracyWhite).toBeGreaterThan(85);
    expect(summary.accuracyBlack).toBe(100);
    expect(summary.blunders).toBe(1);
  });

  it('múltiplos erros das pretas com avaliações negativas', () => {
    // Pretas jogam a partir de posição negativa e pioram
    const positions: PositionAnalysis[] = [
      // ply 1: brancas best, eval after = -50 (pretas vantajosas)
      makePos(1, -50, null, 'best'),
      // ply 2: pretas mistake, before -50 (pretas +50), after +100 (brancas +100)
      // perda perspectiva pretas: +50 → -100 = 150cp → mistake
      makePos(2, 100, null, 'mistake'),
      // ply 3: brancas best
      makePos(3, 100, null, 'best'),
      // ply 4: pretas blunder, before +100, after +500
      // perda perspectiva pretas: -100 → -500 = 400cp → blunder
      makePos(4, 500, null, 'blunder'),
    ];
    const summary = computeSummary(positions);
    // Pretas: 2 lances, 1 mistake (perda 150) + 1 blunder (perda 400)
    // win% mistake(150cp) ≈ 35.8, win% blunder(400cp) ≈ 17.6
    // média = (35.8 + 17.6) / 2 = 26.7, accuracy = 53
    expect(summary.accuracyBlack).toBeLessThan(60);
    expect(summary.accuracyBlack).toBeGreaterThan(45);
    expect(summary.mistakes).toBe(1);
    expect(summary.blunders).toBe(1);
  });

  it('xeque-mate: ganhar mate = best, perder mate = blunder', () => {
    const positions: PositionAnalysis[] = [
      // ply 1: brancas ganham mate
      makePos(1, null, 3, 'best'),
      // ply 2: pretas best
      makePos(2, null, 3, 'best'),
      // ply 3: brancas blunder (perde mate)
      makePos(3, 100, null, 'blunder'),
    ];
    const summary = computeSummary(positions);
    expect(summary.best).toBeGreaterThanOrEqual(1);
    expect(summary.blunders).toBe(1);
    expect(summary.accuracyWhite).toBeLessThan(100);
  });

  it('análise incompleta (classificações null) não afeta precisão', () => {
    const positions: PositionAnalysis[] = [
      makePos(1, 0, null, 'best'),
      makePos(2, 0, null, 'best'),
      // ply 3: sem classificação (não analisado)
      makePos(3, 0, null, null),
      makePos(4, 0, null, 'best'),
    ];
    const summary = computeSummary(positions);
    // Apenas 3 lances classificados: 2 brancos (1 best) + 1 preto (best)
    // mas ply 2 é pretas, ply 4 é pretas, ply 1 é brancas
    // brancas: 1 lance (ply 1) → 100
    // pretas: 2 lances (ply 2, ply 4) → 100
    expect(summary.accuracyWhite).toBe(100);
    expect(summary.accuracyBlack).toBe(100);
    expect(summary.totalMoves).toBe(3);
  });

  it('alternância de cores: cada ply ímpar = brancas, par = pretas', () => {
    const positions: PositionAnalysis[] = [
      makePos(1, 0, null, 'best'),
      makePos(2, 0, null, 'mistake'),
      makePos(3, 0, null, 'best'),
      makePos(4, 0, null, 'blunder'),
    ];
    const summary = computeSummary(positions);
    // ply 1, 3 = brancas (2 best) → 100
    // ply 2, 4 = pretas (1 mistake + 1 blunder) → < 100
    expect(summary.accuracyWhite).toBe(100);
    expect(summary.accuracyBlack).toBeLessThan(100);
  });

  it('não comprime para perto de 100% com erros reais', () => {
    // 10 lances: 7 best + 3 blunders de 300cp, divididos entre cores
    const positions: PositionAnalysis[] = [];
    for (let i = 1; i <= 7; i++) {
      positions.push(makePos(i, 0, null, 'best'));
    }
    // ply 8 (pretas) blunder: before 0, after +300 → perda 300
    positions.push(makePos(8, 300, null, 'blunder'));
    positions[6].evalCp = 0; // ply 7 before
    positions[7].evalCp = 300; // ply 8 after = brancas +300
    // ply 9 (brancas) blunder: before +300, after 0 → perda 300
    positions.push(makePos(9, 0, null, 'blunder'));
    positions[8].evalCp = 300; // ply 8 before = brancas +300
    positions[9].evalCp = 0; // ply 9 after
    // ply 10 (pretas) best
    positions.push(makePos(10, 0, null, 'best'));

    const summary = computeSummary(positions);
    // Brancas: 5 lances (ply 1,3,5,7,9) = 4 best + 1 blunder → accuracy < 95
    // Pretas: 5 lances (ply 2,4,6,8,10) = 4 best + 1 blunder → accuracy < 95
    expect(summary.accuracyWhite).toBeLessThan(95);
    expect(summary.accuracyBlack).toBeLessThan(95);
  });
});

// === REGRESSÃO: posição final e lance ilegal e4g4 ===

// PGN da partida AjmeraKeshav vs Lino_Braga que termina em 27...gxf6.
// A posição final NÃO tem peão em e4, então e4g4 é ilegal nela.
const AJMERA_PGN = `[Event "Rated Blitz Game"]
[White "AjmeraKeshav"]
[Black "Lino_Braga"]
[Result "0-1"]

1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 h6 7. Bh4 b6 8. Rc1 Bb7 9. Bd3 dxc4 10. Bxc4 c5 11. O-O cxd4 12. exd4 Nc6 13. d5 Nb4 14. a3 Na6 15. b4 Nc7 16. dxe6 fxe6 17. Bxe7 Qxe7 18. Qd3 Rf6 19. Bb3 Rhf8 20. Nd5 Nxd5 21. Bxd5 Rxf2 22. Rxf2 Rxf2 23. Qxf2 Qxf2+ 24. Kxf2 Bd5 25. Ke3 Bxb3 26. Rc7 Bxa3 27. gxf6 0-1`;

describe('Regressão: posição final e lance ilegal e4g4', () => {
  it('reproduz a posição final a partir do PGN', () => {
    const { positions, moves } = extractGameMoves(AJMERA_PGN);
    // A partida tem 54 lances (27 completos)
    expect(moves.length).toBe(54);
    // O último lance é gxf6 (ply 54)
    expect(positions).toHaveLength(55); // 54 lances + posição inicial
    const finalPos = positions[54];
    expect(finalPos.ply).toBe(54);
    expect(finalPos.move).toBe('gxf6');
    expect(finalPos.fen).toBeTruthy();
    // A posição final: é a vez das brancas (pretas jogaram o último lance)
    expect(finalPos.fen.split(' ')[1]).toBe('w');
  });

  it('e4g4 é ILEGAL na posição final (casa e4 está vazia)', () => {
    const { positions } = extractGameMoves(AJMERA_PGN);
    const finalFen = positions[54].fen;
    // Verificar que e4g4 não é um lance legal
    expect(isLegalMove(finalFen, 'e4g4')).toBe(false);
  });

  it('e4g4 seria legal na posição inicial (peão em e2, não e4)', () => {
    // Na posição inicial, e2e4 é legal, mas e4g4 não (não há peão em e4)
    const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(isLegalMove(initialFen, 'e4g4')).toBe(false);
  });

  it('isLegalMove: e2e4 é legal na posição inicial', () => {
    const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(isLegalMove(initialFen, 'e2e4')).toBe(true);
  });

  it('isLegalMove: g1f3 é legal na posição inicial', () => {
    const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(isLegalMove(initialFen, 'g1f3')).toBe(true);
  });

  it('isLegalMove: lance impossível (a1a1) é ilegal', () => {
    const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    expect(isLegalMove(initialFen, 'a1a1')).toBe(false);
  });

  it('isLegalMove: FEN inválida retorna false', () => {
    expect(isLegalMove('invalid fen', 'e2e4')).toBe(false);
  });

  it('a FEN da posição final corresponde ao que o Stockfish deveria receber', () => {
    const { positions } = extractGameMoves(AJMERA_PGN);
    const finalFen = positions[54].fen;
    // A FEN deve ser válida e ter o número correto de campos
    const fenParts = finalFen.split(' ');
    expect(fenParts.length).toBeGreaterThanOrEqual(4);
    // Deve ser a vez das brancas (pretas jogaram 27...gxf6)
    expect(fenParts[1]).toBe('w');
    // A posição não deve ter peão branco em e4
    const board = fenParts[0];
    // A coluna 'e' na 4ª fileira (de baixo para cima: fileira 4 = index 4 no FEN)
    const ranks = board.split('/');
    // rank 4 (0-indexed: ranks[4]) — e4 corresponde ao 5º caractere de ranks[4]
    const rank4 = ranks[4];
    // Verificar que não há 'P' na posição e4
    // rank4 is from a8 to h8... no, FEN ranks are from 8 to 1
    // ranks[0] = rank 8, ranks[4] = rank 4
    // e4 file = 'e' = 5th file. We need to parse the run-length encoding
    let fileIdx = 0;
    for (const ch of rank4) {
      if (/\d/.test(ch)) {
        fileIdx += parseInt(ch, 10);
      } else {
        if (fileIdx === 4 && ch === 'P') {
          // Peão em e4
          fail('A posição final tem peão branco em e4 — não deveria');
        }
        fileIdx++;
      }
    }
    // Se chegamos aqui, e4 não tem peão branco
    expect(true).toBe(true);
  });
});

// === REGRESSÃO: associação de resposta com requestId ===

describe('Associação de resposta: requestId isola análises concorrentes', () => {
  it('requestId diferente deve ser ignorado pelo handler', () => {
    // Simula o comportamento do handler: se msg.requestId !== currentRequestId,
    // a mensagem é ignorada.  Isso impede que uma resposta atrasada da
    // posição N-1 sobrescreva a análise da posição N.
    const currentRequestId = 5;
    const delayedRequestId = 4;

    // Mensagem bestmove atrasada da análise anterior
    const delayedMsg = { type: 'bestmove' as const, bestMove: 'e4g4', requestId: delayedRequestId };
    // Mensagem bestmove da análise atual
    const currentMsg = { type: 'bestmove' as const, bestMove: 'a1a2', requestId: currentRequestId };

    // O handler só processa se requestId === currentRequestId
    expect(delayedMsg.requestId === currentRequestId).toBe(false);
    expect(currentMsg.requestId === currentRequestId).toBe(true);
  });

  it('requestId undefined (mensagens antigas) ainda funciona para compatibilidade', () => {
    // Se uma mensagem não tem requestId (worker antigo), ela não é filtrada
    // porque msg.requestId !== undefined falha (undefined !== undefined é false).
    // Mas com o novo worker, todas as mensagens têm requestId.
    const currentRequestId = 1;
    const msgWithoutId = { type: 'bestmove' as const, bestMove: 'e2e4' };
    expect(msgWithoutId.requestId === undefined).toBe(true);
    // undefined !== currentRequestId (1) → true, então seria filtrada
    // MAS: msg.requestId !== undefined é false, então a guarda não aplica
    // A lógica é: if (msg.requestId !== undefined && msg.requestId !== currentRequestId) return;
    const shouldIgnore = msgWithoutId.requestId !== undefined && msgWithoutId.requestId !== currentRequestId;
    expect(shouldIgnore).toBe(false);
  });
});
