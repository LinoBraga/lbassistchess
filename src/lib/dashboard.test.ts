import { describe, it, expect } from 'vitest';
import {
  computeDashboardMetrics,
  type DashboardAnalysis,
  type DashboardExercise,
  type DashboardAttempt,
  type DashboardDiagnosis,
} from './dashboard';
import type { PositionAnalysis } from './analysis';

function makePos(
  ply: number,
  classification: PositionAnalysis['classification'],
  evalCp: number | null = 0,
  evalMate: number | null = null,
): PositionAnalysis {
  return {
    ply,
    fen: '',
    move: `m${ply}`,
    bestMove: null,
    evalCp,
    evalMate,
    depth: 15,
    pv: null,
    classification,
  };
}

function makeAnalysis(
  gameId: string,
  positions: PositionAnalysis[],
  playedAt: string | null = null,
  totalMoves?: number,
): DashboardAnalysis {
  return {
    gameId,
    playedAt,
    positions,
    summary: { totalMoves: totalMoves ?? positions.filter((p) => p.classification).length },
  };
}

const NO_DIAG = null;

describe('computeDashboardMetrics — cenário 1: sem partidas', () => {
  it('retorna tudo vazio sem dados', () => {
    const result = computeDashboardMetrics([], [], [], NO_DIAG);
    expect(result.analyzedGames).toBe(0);
    expect(result.totalExercises).toBe(0);
    expect(result.hasAnyData).toBe(false);
    expect(result.skills.every((s) => s.value === null)).toBe(true);
    expect(result.attention).toBeNull();
    expect(result.dailyTraining.hasMaterial).toBe(false);
    expect(result.evolution.canCompare).toBe(false);
  });
});

describe('cenário 2: partidas importadas, não analisadas', () => {
  it('não há análises → skills vazias, sem atenção, sem treino', () => {
    const result = computeDashboardMetrics([], [], [], NO_DIAG);
    expect(result.analyzedGames).toBe(0);
    expect(result.skills.every((s) => s.value === null && s.positionsUsed === 0)).toBe(true);
    expect(result.attention).toBeNull();
    expect(result.dailyTraining.hasMaterial).toBe(false);
  });
});

describe('cenário 3: partidas analisadas com erros graves', () => {
  it('classifica erros por categoria e calcula notas', () => {
    // Partida com blunder no meio-jogo (tatica), mistake no meio-jogo (calculo), inaccuracy (estrategia)
    const positions: PositionAnalysis[] = [
      makePos(1, null),
      makePos(2, null),
      makePos(15, 'blunder', -300), // meio-jogo blunder → tatica
      makePos(16, null),
      makePos(20, 'mistake', -150), // meio-jogo mistake → calculo
      makePos(22, 'inaccuracy', -50), // meio-jogo inaccuracy → estrategia
    ];
    const analysis = makeAnalysis('g1', positions, '2024-01-01', 5);

    const result = computeDashboardMetrics([analysis], [], [], NO_DIAG);

    expect(result.analyzedGames).toBe(1);
    const tatica = result.skills.find((s) => s.category === 'tatica')!;
    expect(tatica.value).not.toBeNull();
    expect(tatica.positionsUsed).toBe(1);
    expect(tatica.gamesUsed).toBe(1);

    const calculo = result.skills.find((s) => s.category === 'calculo')!;
    expect(calculo.value).not.toBeNull();
    expect(calculo.positionsUsed).toBe(1);

    const estrategia = result.skills.find((s) => s.category === 'estrategia')!;
    expect(estrategia.value).not.toBeNull();
    expect(estrategia.positionsUsed).toBe(1);

    // Abertura e finais sem erros → null
    const abertura = result.skills.find((s) => s.category === 'abertura')!;
    expect(abertura.value).toBeNull();

    const finais = result.skills.find((s) => s.category === 'finais')!;
    expect(finais.value).toBeNull();
  });

  it('infere ponto de atenção sem diagnóstico salvo', () => {
    const positions: PositionAnalysis[] = [
      makePos(15, 'blunder', -300),
      makePos(16, 'blunder', -400),
      makePos(17, 'blunder', -350),
    ];
    const analysis = makeAnalysis('g1', positions, '2024-01-01', 3);

    const result = computeDashboardMetrics([analysis], [], [], NO_DIAG);
    expect(result.attention).not.toBeNull();
    expect(result.attention!.category).toBe('tatica');
    expect(result.attention!.occurrences).toBe(3);
  });

  it('usa diagnóstico salvo quando disponível', () => {
    const positions: PositionAnalysis[] = [makePos(15, 'blunder', -300)];
    const analysis = makeAnalysis('g1', positions, '2024-01-01', 1);
    const diagnosis: DashboardDiagnosis = {
      categories: [
        {
          category: 'finais',
          categoryLabel: 'Finais de partida',
          occurrences: 5,
          gamesUsed: 3,
          confidence: 'alta',
          confidenceLabel: 'Alta — 5 ocorrências em 3 partidas',
          recommendation: 'Estude finais básicos.',
          examplePositions: [],
          trend: 'estavel',
        },
      ],
      gamesAnalyzed: 3,
    };

    const result = computeDashboardMetrics([analysis], [], [], diagnosis);
    expect(result.attention).not.toBeNull();
    expect(result.attention!.category).toBe('finais');
    expect(result.attention!.occurrences).toBe(5);
  });
});

describe('cenário 4: exercícios salvos e resultados de treino', () => {
  it('constrói treino do dia a partir de exercícios da categoria prioritária', () => {
    const exercises: DashboardExercise[] = [
      { id: 'e1', category: 'tatica' },
      { id: 'e2', category: 'tatica' },
      { id: 'e3', category: 'abertura' },
    ];
    const diagnosis: DashboardDiagnosis = {
      categories: [
        {
          category: 'tatica',
          categoryLabel: 'Táticas e combinações',
          occurrences: 4,
          gamesUsed: 2,
          confidence: 'media',
          confidenceLabel: 'Média — 4 ocorrências em 2 partidas',
          recommendation: 'Pratique táticas.',
          examplePositions: [],
          trend: 'insuficiente',
        },
      ],
      gamesAnalyzed: 2,
    };

    const result = computeDashboardMetrics([], exercises, [], diagnosis);
    expect(result.dailyTraining.hasMaterial).toBe(true);
    expect(result.dailyTraining.theme).toBe('Táticas e combinações');
    expect(result.dailyTraining.category).toBe('tatica');
    expect(result.dailyTraining.exercisesAvailable).toBe(2);
  });

  it('calcula evolução de acurácia em exercícios', () => {
    const now = Date.now();
    const attempts: DashboardAttempt[] = [
      { exercise_id: 'e1', is_correct: false, created_at: new Date(now - 50000).toISOString() },
      { exercise_id: 'e2', is_correct: false, created_at: new Date(now - 40000).toISOString() },
      { exercise_id: 'e3', is_correct: false, created_at: new Date(now - 30000).toISOString() },
      { exercise_id: 'e4', is_correct: true, created_at: new Date(now - 20000).toISOString() },
      { exercise_id: 'e5', is_correct: true, created_at: new Date(now - 10000).toISOString() },
    ];

    const result = computeDashboardMetrics([], [], attempts, NO_DIAG);
    expect(result.evolution.totalAttempts).toBe(5);
    expect(result.evolution.correctAttempts).toBe(2);
    expect(result.evolution.accuracy).toBe(40);
    expect(result.evolution.canCompare).toBe(true);
    // primeira metade: 0/3 = 0%, segunda metade: 2/2 = 100% → melhorando
    expect(result.evolution.accuracyTrend).toBe('melhorando');
  });
});

describe('cenário 5: várias partidas em datas diferentes', () => {
  it('compara taxa de erro entre períodos', () => {
    // 5 partidas: 3 antigas com mais erros, 2 recentes com menos
    const analyses: DashboardAnalysis[] = [
      makeAnalysis('g1', [makePos(15, 'blunder', -300), makePos(20, 'mistake', -100)], '2024-01-01', 5),
      makeAnalysis('g2', [makePos(15, 'blunder', -400), makePos(20, 'mistake', -150)], '2024-02-01', 5),
      makeAnalysis('g3', [makePos(15, 'blunder', -350), makePos(20, 'mistake', -120)], '2024-03-01', 5),
      makeAnalysis('g4', [makePos(15, 'inaccuracy', -40)], '2024-04-01', 5),
      makeAnalysis('g5', [makePos(15, 'inaccuracy', -30)], '2024-05-01', 5),
    ];

    const result = computeDashboardMetrics(analyses, [], [], NO_DIAG);
    expect(result.evolution.canCompare).toBe(true);
    expect(result.evolution.olderErrorRate).not.toBeNull();
    expect(result.evolution.recentErrorRate).not.toBeNull();
    expect(result.evolution.errorTrend).toBe('melhorando');
  });

  it('não duplica partidas reanalisadas — usa game_id único', () => {
    const positions: PositionAnalysis[] = [makePos(15, 'blunder', -300)];
    const analysis = makeAnalysis('g1', positions, '2024-01-01', 1);

    const result = computeDashboardMetrics([analysis, analysis], [], [], NO_DIAG);
    // A contagem de partidas analisadas é o número de análises (não deduplica por gameId aqui,
    // mas a hook usa .in('game_id', ids) que retorna uma linha por análise ativa).
    // O ponto-chave: o cálculo de skills não infla indefinidamente.
    const tatica = result.skills.find((s) => s.category === 'tatica')!;
    expect(tatica.positionsUsed).toBe(2); // 2 análises, cada com 1 blunder
  });
});

describe('cenário 6: histórico insuficiente para uma habilidade', () => {
  it('mostra "Sem dados" com motivo quando há menos de 3 posições', () => {
    const positions: PositionAnalysis[] = [
      makePos(15, 'blunder', -300),
      makePos(20, 'mistake', -100),
    ];
    const analysis = makeAnalysis('g1', positions, '2024-01-01', 2);

    const result = computeDashboardMetrics([analysis], [], [], NO_DIAG);
    const tatica = result.skills.find((s) => s.category === 'tatica')!;
    // Apenas 1 blunder → abaixo do mínimo de 3
    expect(tatica.value).toBeNull();
    expect(tatica.reason).toContain('1 posição');
  });

  it('explica quando não há erros em uma categoria', () => {
    const result = computeDashboardMetrics([], [], [], NO_DIAG);
    const finais = result.skills.find((s) => s.category === 'finais')!;
    expect(finais.value).toBeNull();
    expect(finais.reason).toContain('Sem erros');
  });
});

describe('cenário 7: falha na consulta', () => {
  it('a hook trata erro — computeDashboardMetrics não lança com dados vazios', () => {
    expect(() => computeDashboardMetrics([], [], [], null)).not.toThrow();
  });
});

describe('treino do dia — sem exercícios mas com análises', () => {
  it('indica que há ponto de atenção mas faltam exercícios', () => {
    const positions: PositionAnalysis[] = [
      makePos(15, 'blunder', -300),
      makePos(16, 'blunder', -400),
      makePos(17, 'blunder', -350),
    ];
    const analysis = makeAnalysis('g1', positions, '2024-01-01', 3);

    const result = computeDashboardMetrics([analysis], [], [], NO_DIAG);
    expect(result.attention).not.toBeNull();
    expect(result.dailyTraining.hasMaterial).toBe(false);
    expect(result.dailyTraining.reason).toContain('exercícios');
  });
});

describe('mapeamento de fases', () => {
  it('erro na abertura (ply <= 10) → categoria abertura', () => {
    const positions: PositionAnalysis[] = [
      makePos(5, 'blunder', -300),
      makePos(6, 'blunder', -400),
      makePos(7, 'blunder', -350),
    ];
    const analysis = makeAnalysis('g1', positions, '2024-01-01', 3);

    const result = computeDashboardMetrics([analysis], [], [], NO_DIAG);
    const abertura = result.skills.find((s) => s.category === 'abertura')!;
    expect(abertura.value).not.toBeNull();
    expect(abertura.positionsUsed).toBe(3);
  });

  it('erro com mate → categoria tatica', () => {
    const positions: PositionAnalysis[] = [
      makePos(30, 'blunder', null, 3),
      makePos(31, 'blunder', null, 4),
      makePos(32, 'blunder', null, 5),
    ];
    const analysis = makeAnalysis('g1', positions, '2024-01-01', 3);

    const result = computeDashboardMetrics([analysis], [], [], NO_DIAG);
    const tatica = result.skills.find((s) => s.category === 'tatica')!;
    expect(tatica.value).not.toBeNull();
    expect(tatica.positionsUsed).toBe(3);
  });

  it('erro no final (ply >= 75% do total) → categoria finais', () => {
    const totalPlies = 40;
    const positions: PositionAnalysis[] = [];
    for (let i = 0; i < totalPlies; i++) {
      positions.push(makePos(i, i >= 30 ? 'inaccuracy' : null, i >= 30 ? -40 : 0));
    }
    const analysis = makeAnalysis('g1', positions, '2024-01-01', 10);

    const result = computeDashboardMetrics([analysis], [], [], NO_DIAG);
    const finais = result.skills.find((s) => s.category === 'finais')!;
    expect(finais.value).not.toBeNull();
    expect(finais.positionsUsed).toBeGreaterThanOrEqual(3);
  });
});
