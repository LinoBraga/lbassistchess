import { Chess } from 'chess.js';
import type { PositionAnalysis } from '@/lib/analysis';

export type WeaknessCategory =
  | 'tatica'
  | 'pecas_indefesas'
  | 'calculo'
  | 'abertura'
  | 'estrategia'
  | 'estrutura_peoes'
  | 'conversao'
  | 'defesa'
  | 'finais';

export interface CategoryDiagnosis {
  category: WeaknessCategory;
  categoryLabel: string;
  occurrences: number;
  gamesUsed: number;
  confidence: 'alta' | 'media' | 'baixa';
  confidenceLabel: string;
  recommendation: string;
  examplePositions: ExamplePosition[];
  trend: 'melhorando' | 'estavel' | 'piorando' | 'insuficiente';
}

export interface ExamplePosition {
  gameId: string;
  ply: number;
  fen: string;
  move: string;
  bestMove: string | null;
  evalCp: number | null;
  evalMate: number | null;
  classification: string;
}

export interface Diagnosis {
  categories: CategoryDiagnosis[];
  gamesAnalyzed: number;
  totalErrors: number;
  totalBlunders: number;
  totalMistakes: number;
  totalInaccuracies: number;
}

export interface GameAnalysisData {
  gameId: string;
  playedAt: string | null;
  positions: PositionAnalysis[];
  summary: {
    inaccuracies: number;
    mistakes: number;
    blunders: number;
    accuracyWhite: number | null;
    accuracyBlack: number | null;
    totalMoves: number;
  };
}

export const CATEGORY_LABELS: Record<WeaknessCategory, string> = {
  tatica: 'Táticas e combinações',
  pecas_indefesas: 'Peças penduradas e indefesas',
  calculo: 'Erros de cálculo',
  abertura: 'Abertura e desenvolvimento',
  estrategia: 'Estratégia e planejamento',
  estrutura_peoes: 'Estruturas de peões',
  conversao: 'Conversão de posições vantajosas',
  defesa: 'Defesa de posições inferiores',
  finais: 'Finais de partida',
};

const MIN_GAMES_FOR_CONFIDENCE = 5;
const MIN_OCCURRENCES_FOR_DIAGNOSIS = 2;

/**
 * Computa o diagnóstico de fraquezas a partir das análises de partidas.
 *
 * Estratégia honesta: cada erro classificado é categorizado com base na fase
 * da partida (ply) e na magnitude da perda. Uma queda de avaliação isolada
 * não prova a causa — categorizamos com base em evidências disponíveis
 * (fase, tamanho da perda, posição de mate) e indicamos a confiança.
 */
export function computeDiagnosis(games: GameAnalysisData[]): Diagnosis {
  if (games.length === 0) {
    return {
      categories: [],
      gamesAnalyzed: 0,
      totalErrors: 0,
      totalBlunders: 0,
      totalMistakes: 0,
      totalInaccuracies: 0,
    };
  }

  const categoryCounts = new Map<WeaknessCategory, ExamplePosition[]>();
  let totalBlunders = 0;
  let totalMistakes = 0;
  let totalInaccuracies = 0;

  for (const game of games) {
    for (const pos of game.positions) {
      if (!pos.classification || pos.classification === 'best' || pos.classification === 'excellent') continue;

      if (pos.classification === 'blunder') totalBlunders++;
      else if (pos.classification === 'mistake') totalMistakes++;
      else if (pos.classification === 'inaccuracy') totalInaccuracies++;

      const category = categorizeError(pos, game.positions.length);
      const example: ExamplePosition = {
        gameId: game.gameId,
        ply: pos.ply,
        fen: pos.fen,
        move: pos.move ?? '',
        bestMove: pos.bestMove,
        evalCp: pos.evalCp,
        evalMate: pos.evalMate,
        classification: pos.classification,
      };

      const existing = categoryCounts.get(category) ?? [];
      existing.push(example);
      categoryCounts.set(category, existing);
    }
  }

  // Construir categorias de diagnóstico
  const categories: CategoryDiagnosis[] = [];

  for (const [category, examples] of categoryCounts.entries()) {
    if (examples.length < MIN_OCCURRENCES_FOR_DIAGNOSIS) continue;

    const gamesUsed = new Set(examples.map((e) => e.gameId)).size;
    const confidence = determineConfidence(games.length, examples.length, gamesUsed);

    categories.push({
      category,
      categoryLabel: CATEGORY_LABELS[category],
      occurrences: examples.length,
      gamesUsed,
      confidence: confidence.level,
      confidenceLabel: confidence.label,
      recommendation: getRecommendation(category),
      examplePositions: examples.slice(0, 3),
      trend: 'insuficiente',
    });
  }

  // Ordenar por ocorrências (mais frequente primeiro)
  categories.sort((a, b) => b.occurrences - a.occurrences);

  // Calcular tendência se houver partidas suficientes
  if (games.length >= MIN_GAMES_FOR_CONFIDENCE) {
    computeTrends(categories, games);
  }

  return {
    categories,
    gamesAnalyzed: games.length,
    totalErrors: totalBlunders + totalMistakes + totalInaccuracies,
    totalBlunders,
    totalMistakes,
    totalInaccuracies,
  };
}

/**
 * Categoriza um erro com base na fase da partida e características da posição.
 * Usa evidências disponíveis — não inventa causas.
 */
function categorizeError(pos: PositionAnalysis, totalPlies: number): WeaknessCategory {
  const phase = getGamePhase(pos.ply, totalPlies);

  // Abertura: primeiros 10 lances
  if (phase === 'opening') {
    return 'abertura';
  }

  // Finais: últimos 25% dos lances
  if (phase === 'endgame') {
    return 'finais';
  }

  // Meio-jogo: classificar por características da avaliação
  const isMate = pos.evalMate !== null;
  const evalLoss = pos.evalCp ?? 0;

  // Se houve mate envolvido, provavelmente é tática
  if (isMate) {
    return 'tatica';
  }

  // Erros grandes (blunders) tendem a ser táticos ou de cálculo
  if (pos.classification === 'blunder') {
    // Perda muito grande pode ser peça pendurada ou tática perdida
    return 'tatica';
  }

  // Erros moderados no meio-jogo
  if (pos.classification === 'mistake') {
    return 'calculo';
  }

  // Imprecisões no meio-jogo: estratégia
  return 'estrategia';
}

function getGamePhase(ply: number, totalPlies: number): 'opening' | 'middlegame' | 'endgame' {
  if (ply <= 10) return 'opening';
  if (ply >= totalPlies * 0.75) return 'endgame';
  return 'middlegame';
}

function determineConfidence(
  totalGames: number,
  occurrences: number,
  gamesUsed: number,
): { level: 'alta' | 'media' | 'baixa'; label: string } {
  if (totalGames >= MIN_GAMES_FOR_CONFIDENCE && occurrences >= 5) {
    return { level: 'alta', label: `Alta — ${occurrences} ocorrências em ${gamesUsed} partidas` };
  }
  if (totalGames >= 3 && occurrences >= 3) {
    return { level: 'media', label: `Média — ${occurrences} ocorrências em ${gamesUsed} partidas` };
  }
  return { level: 'baixa', label: `Baixa — amostra de ${occurrences} ocorrência(s) em ${gamesUsed} partida(s)` };
}

function getRecommendation(category: WeaknessCategory): string {
  const recommendations: Record<WeaknessCategory, string> = {
    tatica: 'Pratique exercícios táticos diários (motivos como garfo, cravada, ataque descoberto). Foque em calcular pelo menos 3 lances antes de mover.',
    pecas_indefesas: 'Antes de cada lance, verifique se alguma peça sua ficou indefesa ou se pode ser atacada gratuitamente.',
    calculo: 'Treine cálculo de variantes forçadas. Tente visualizar a posição 2-3 lances à frente antes de decidir.',
    abertura: 'Estude os princípios de abertura: controle do centro, desenvolvimento rápido, segurança do rei. Evite mover a mesma peça duas vezes na abertura.',
    estrategia: 'Estude planos posicionais: alvo das peças, melhoria da pior peça, profilaxia. Aprenda a avaliar estruturas de peões.',
    estrutura_peoes: 'Estude formasções de peões (caro, ilhas, peões dobrados) e quando abrir ou fechar o centro.',
    conversao: 'Pratique a conversão de vantagem: simplifique quando estiver ganhando, não busque complicação desnecessária.',
    defesa: 'Treine defesa de posições difíceis: identifique as ameaças, encontre movimentos de espera ativos, não entre em pânico.',
    finais: 'Estude finais básicos: rei e peão contra rei, oposição, finais de torres, regra do quadrado.',
  };
  return recommendations[category];
}

/**
 * Calcula tendência recente comparando primeira metade vs segunda metade das partidas.
 */
function computeTrends(categories: CategoryDiagnosis[], games: GameAnalysisData[]): void {
  if (games.length < MIN_GAMES_FOR_CONFIDENCE * 2) return;

  const midpoint = Math.floor(games.length / 2);
  const olderGames = games.slice(0, midpoint);
  const recentGames = games.slice(midpoint);

  for (const cat of categories) {
    const olderCount = countInCategory(cat, olderGames);
    const recentCount = countInCategory(cat, recentGames);

    // Normalizar por número de partidas
    const olderRate = olderCount / olderGames.length;
    const recentRate = recentCount / recentGames.length;

    if (recentRate < olderRate * 0.7) {
      cat.trend = 'melhorando';
    } else if (recentRate > olderRate * 1.3) {
      cat.trend = 'piorando';
    } else {
      cat.trend = 'estavel';
    }
  }
}

function countInCategory(cat: CategoryDiagnosis, games: GameAnalysisData[]): number {
  let count = 0;
  for (const game of games) {
    for (const pos of game.positions) {
      if (!pos.classification || pos.classification === 'best' || pos.classification === 'excellent') continue;
      const category = categorizeError(pos, game.positions.length);
      if (category === cat.category) count++;
    }
  }
  return count;
}

export const TREND_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  melhorando: { label: 'Melhorando', color: 'text-success-400', icon: '↓' },
  estavel: { label: 'Estável', color: 'text-content-secondary', icon: '→' },
  piorando: { label: 'Piorando', color: 'text-danger-400', icon: '↑' },
  insuficiente: { label: 'Dados insuficientes', color: 'text-content-muted', icon: '?' },
};
