import type { PositionAnalysis } from '@/lib/analysis';
import {
  CATEGORY_LABELS,
  type WeaknessCategory,
  type CategoryDiagnosis,
} from '@/lib/diagnosis';

/**
 * Tipos de entrada para o cálculo das métricas do painel.
 * Reaproveita os mesmos modelos já usados por useDiagnosis e EvolucaoPage.
 */
export interface DashboardAnalysis {
  gameId: string;
  playedAt: string | null;
  positions: PositionAnalysis[];
  summary: {
    totalMoves: number;
  };
}

export interface DashboardExercise {
  id: string;
  category: string;
}

export interface DashboardAttempt {
  exercise_id: string;
  is_correct: boolean;
  created_at: string;
}

export interface DashboardDiagnosis {
  categories: CategoryDiagnosis[];
  gamesAnalyzed: number;
}

/**
 * Indicador de habilidade para o painel.
 * `value` é null quando não há dados suficientes.
 */
export interface SkillIndicator {
  category: WeaknessCategory;
  label: string;
  value: number | null;
  positionsUsed: number;
  gamesUsed: number;
  reason: string;
}

export interface AttentionPoint {
  category: WeaknessCategory;
  label: string;
  occurrences: number;
  gamesUsed: number;
  evidence: string;
  recommendation: string;
}

export interface DailyTrainingInfo {
  theme: string;
  category: WeaknessCategory | null;
  exercisesAvailable: number;
  hasMaterial: boolean;
  reason: string;
}

export interface EvolutionSnapshot {
  totalAttempts: number;
  correctAttempts: number;
  accuracy: number | null;
  canCompare: boolean;
  olderAccuracy: number | null;
  recentAccuracy: number | null;
  accuracyTrend: 'melhorando' | 'piorando' | 'estavel' | 'insuficiente';
  analyzedGames: number;
  olderErrorRate: number | null;
  recentErrorRate: number | null;
  errorTrend: 'melhorando' | 'piorando' | 'estavel' | 'insuficiente';
}

export interface DashboardMetrics {
  analyzedGames: number;
  totalExercises: number;
  skills: SkillIndicator[];
  attention: AttentionPoint | null;
  dailyTraining: DailyTrainingInfo;
  evolution: EvolutionSnapshot;
  hasAnyData: boolean;
}

const MIN_POSITIONS_FOR_SKILL = 3;
const MIN_GAMES_FOR_TREND = 5;

/**
 * Categoriza um erro por fase da partida, replicando a lógica de diagnosis.ts.
 * Exportada aqui para que o painel use a mesma classificação do diagnóstico.
 */
function categorizeError(pos: PositionAnalysis, totalPlies: number): WeaknessCategory {
  const phase = getGamePhase(pos.ply, totalPlies);
  if (phase === 'opening') return 'abertura';
  if (phase === 'endgame') return 'finais';
  if (pos.evalMate !== null) return 'tatica';
  if (pos.classification === 'blunder') return 'tatica';
  if (pos.classification === 'mistake') return 'calculo';
  return 'estrategia';
}

function getGamePhase(ply: number, totalPlies: number): 'opening' | 'middlegame' | 'endgame' {
  if (ply <= 10) return 'opening';
  if (ply >= totalPlies * 0.75) return 'endgame';
  return 'middlegame';
}

/**
 * Computa todas as métricas do painel a partir dos dados reais.
 * Função pura — não acessa o banco, facilitando testes.
 */
export function computeDashboardMetrics(
  analyses: DashboardAnalysis[],
  exercises: DashboardExercise[],
  attempts: DashboardAttempt[],
  diagnosis: DashboardDiagnosis | null,
): DashboardMetrics {
  const analyzedGames = analyses.length;
  const totalExercises = exercises.length;

  // === Indicadores de habilidade ===
  // Acumular erros por categoria, usando a mesma lógica do diagnóstico.
  const categoryPositions = new Map<WeaknessCategory, { count: number; games: Set<string> }>();
  const trackedCategories: WeaknessCategory[] = ['tatica', 'calculo', 'estrategia', 'finais', 'abertura'];

  for (const cat of trackedCategories) {
    categoryPositions.set(cat, { count: 0, games: new Set() });
  }

  for (const analysis of analyses) {
    const totalPlies = analysis.positions.length;
    for (const pos of analysis.positions) {
      if (!pos.classification) continue;
      if (pos.classification === 'best' || pos.classification === 'excellent') continue;
      const cat = categorizeError(pos, totalPlies);
      const entry = categoryPositions.get(cat);
      if (entry) {
        entry.count++;
        entry.games.add(analysis.gameId);
      }
    }
  }

  const skills: SkillIndicator[] = trackedCategories.map((cat) => {
    const entry = categoryPositions.get(cat)!;
    if (entry.count < MIN_POSITIONS_FOR_SKILL) {
      return {
        category: cat,
        label: CATEGORY_LABELS[cat],
        value: null,
        positionsUsed: entry.count,
        gamesUsed: entry.games.size,
        reason: entry.count === 0
          ? 'Sem erros classificados nesta categoria.'
          : `Apenas ${entry.count} posição(ões) — mínimo de ${MIN_POSITIONS_FOR_SKILL} para uma nota.`,
      };
    }
    // Nota baseada na proporção de erros: mais erros = nota menor.
    // Escala: 0 erros = 100; usamos uma fórmula simples e transparente.
    // taxa de erro nessa categoria = count / totalMoves analisados.
    const totalMoves = analyses.reduce((s, a) => s + a.summary.totalMoves, 0);
    const errorShare = totalMoves > 0 ? entry.count / totalMoves : 0;
    // 0% de erros → 100; 15%+ de erros → ~40 (limite inferior)
    const value = Math.round(Math.max(40, 100 - errorShare * 400));
    return {
      category: cat,
      label: CATEGORY_LABELS[cat],
      value,
      positionsUsed: entry.count,
      gamesUsed: entry.games.size,
      reason: `${entry.count} erro(s) em ${entry.games.size} partida(s).`,
    };
  });

  // === Ponto de atenção ===
  let attention: AttentionPoint | null = null;
  if (diagnosis && diagnosis.categories.length > 0) {
    const top = diagnosis.categories[0];
    attention = {
      category: top.category,
      label: top.categoryLabel,
      occurrences: top.occurrences,
      gamesUsed: top.gamesUsed,
      evidence: `${top.occurrences} ocorrência(s) em ${top.gamesUsed} partida(s). Confiança: ${top.confidenceLabel}.`,
      recommendation: top.recommendation,
    };
  } else if (analyzedGames > 0) {
    // Sem diagnóstico salvo, mas com análises — inferir da contagem local.
    const sorted = trackedCategories
      .map((cat) => ({ cat, entry: categoryPositions.get(cat)! }))
      .filter((x) => x.entry.count >= MIN_POSITIONS_FOR_SKILL)
      .sort((a, b) => b.entry.count - a.entry.count);
    if (sorted.length > 0) {
      const top = sorted[0];
      attention = {
        category: top.cat,
        label: CATEGORY_LABELS[top.cat],
        occurrences: top.entry.count,
        gamesUsed: top.entry.games.size,
        evidence: `${top.entry.count} erro(s) em ${top.entry.games.size} partida(s). Diagnóstico não salvo — inferência local.`,
        recommendation: getRecommendation(top.cat),
      };
    }
  }

  // === Treino do dia ===
  const dailyTraining = buildDailyTraining(exercises, attention);

  // === Evolução recente ===
  const evolution = buildEvolution(analyses, attempts);

  return {
    analyzedGames,
    totalExercises,
    skills,
    attention,
    dailyTraining,
    evolution,
    hasAnyData: analyzedGames > 0 || totalExercises > 0 || attempts.length > 0,
  };
}

function buildDailyTraining(
  exercises: DashboardExercise[],
  attention: AttentionPoint | null,
): DailyTrainingInfo {
  if (exercises.length === 0) {
    return {
      theme: attention ? `${attention.label}` : 'Treino personalizado',
      category: attention?.category ?? null,
      exercisesAvailable: 0,
      hasMaterial: false,
      reason: attention
        ? 'Seu ponto de atenção foi identificado, mas ainda não há exercícios salvos. Gere exercícios a partir das suas análises.'
        : 'Importe e analise partidas para gerar exercícios personalizados.',
    };
  }

  // Priorizar exercícios da categoria do ponto de atenção, se houver.
  let theme: string;
  let category: WeaknessCategory | null;
  let available: number;

  if (attention) {
    const matching = exercises.filter((e) => e.category === attention.category);
    if (matching.length > 0) {
      theme = attention.label;
      category = attention.category;
      available = matching.length;
    } else {
      // Sem exercícios da categoria优先ária — usar a categoria mais comum entre os exercícios.
      const catCount = new Map<string, number>();
      for (const ex of exercises) {
        catCount.set(ex.category, (catCount.get(ex.category) ?? 0) + 1);
      }
      const topCat = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0];
      theme = CATEGORY_LABELS[topCat[0] as WeaknessCategory] ?? topCat[0];
      category = topCat[0] as WeaknessCategory;
      available = topCat[1];
    }
  } else {
    const catCount = new Map<string, number>();
    for (const ex of exercises) {
      catCount.set(ex.category, (catCount.get(ex.category) ?? 0) + 1);
    }
    const topCat = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0];
    theme = CATEGORY_LABELS[topCat[0] as WeaknessCategory] ?? topCat[0];
    category = topCat[0] as WeaknessCategory;
    available = topCat[1];
  }

  return {
    theme,
    category,
    exercisesAvailable: available,
    hasMaterial: true,
    reason: `${available} exercício(s) disponível(is) focado(s) em ${theme}.`,
  };
}

function buildEvolution(
  analyses: DashboardAnalysis[],
  attempts: DashboardAttempt[],
): EvolutionSnapshot {
  const totalAttempts = attempts.length;
  const correctAttempts = attempts.filter((a) => a.is_correct).length;
  const accuracy = totalAttempts > 0 ? (correctAttempts / totalAttempts) * 100 : null;

  // Comparar acurácia em exercícios: primeira metade vs segunda metade.
  let olderAccuracy: number | null = null;
  let recentAccuracy: number | null = null;
  let accuracyTrend: EvolutionSnapshot['accuracyTrend'] = 'insuficiente';

  if (totalAttempts >= MIN_GAMES_FOR_TREND) {
    const sorted = [...attempts].sort((a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const mid = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, mid);
    const recent = sorted.slice(mid);
    if (older.length > 0 && recent.length > 0) {
      olderAccuracy = (older.filter((a) => a.is_correct).length / older.length) * 100;
      recentAccuracy = (recent.filter((a) => a.is_correct).length / recent.length) * 100;
      const diff = recentAccuracy - olderAccuracy;
      if (diff > 5) accuracyTrend = 'melhorando';
      else if (diff < -5) accuracyTrend = 'piorando';
      else accuracyTrend = 'estavel';
    }
  }

  // Taxa de erro nas partidas: primeira metade vs segunda metade.
  const canCompare = analyses.length >= MIN_GAMES_FOR_TREND;
  let olderErrorRate: number | null = null;
  let recentErrorRate: number | null = null;
  let errorTrend: EvolutionSnapshot['errorTrend'] = 'insuficiente';

  if (canCompare) {
    const sorted = [...analyses].sort((a, b) =>
      new Date(a.playedAt ?? 0).getTime() - new Date(b.playedAt ?? 0).getTime(),
    );
    const mid = Math.floor(sorted.length / 2);
    olderErrorRate = computeErrorRate(sorted.slice(0, mid));
    recentErrorRate = computeErrorRate(sorted.slice(mid));
    if (olderErrorRate !== null && recentErrorRate !== null) {
      const diff = olderErrorRate - recentErrorRate;
      if (diff > 2) errorTrend = 'melhorando';
      else if (diff < -2) errorTrend = 'piorando';
      else errorTrend = 'estavel';
    }
  }

  return {
    totalAttempts,
    correctAttempts,
    accuracy,
    canCompare,
    olderAccuracy,
    recentAccuracy,
    accuracyTrend,
    analyzedGames: analyses.length,
    olderErrorRate,
    recentErrorRate,
    errorTrend,
  };
}

function computeErrorRate(analyses: DashboardAnalysis[]): number | null {
  let totalErrors = 0;
  let totalMoves = 0;
  for (const a of analyses) {
    const positions = a.positions ?? [];
    totalErrors += positions.filter((p) =>
      p.classification && p.classification !== 'best' && p.classification !== 'excellent',
    ).length;
    totalMoves += a.summary.totalMoves;
  }
  return totalMoves > 0 ? (totalErrors / totalMoves) * 100 : null;
}

function getRecommendation(category: WeaknessCategory): string {
  const recommendations: Record<WeaknessCategory, string> = {
    tatica: 'Pratique exercícios táticos diários (motivos como garfo, cravada, ataque descoberto).',
    pecas_indefesas: 'Antes de cada lance, verifique se alguma peça sua ficou indefesa.',
    calculo: 'Treine cálculo de variantes forçadas. Visualize 2-3 lances à frente.',
    abertura: 'Estude os princípios de abertura: centro, desenvolvimento, segurança do rei.',
    estrategia: 'Estude planos posicionais: alvo das peças, melhoria da pior peça, profilaxia.',
    estrutura_peoes: 'Estude formações de peões (caro, ilhas, peões dobrados).',
    conversao: 'Pratique a conversão de vantagem: simplifique quando estiver ganhando.',
    defesa: 'Treine defesa de posições difíceis: identifique ameaças, não entre em pânico.',
    finais: 'Estude finais básicos: rei e peão contra rei, oposição, finais de torres.',
  };
  return recommendations[category];
}
