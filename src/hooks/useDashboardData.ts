import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  computeDashboardMetrics,
  type DashboardMetrics,
  type DashboardAnalysis,
  type DashboardExercise,
  type DashboardAttempt,
  type DashboardDiagnosis,
} from '@/lib/dashboard';

interface AnalysisRow {
  game_id: string;
  positions: DashboardAnalysis['positions'] | null;
  summary: DashboardAnalysis['summary'] | null;
}

interface GameRow {
  id: string;
  played_at: string | null;
}

interface ExerciseRow {
  id: string;
  category: string;
}

interface AttemptRow {
  exercise_id: string;
  is_correct: boolean;
  created_at: string;
}

interface DiagnosisRow {
  categories: DashboardDiagnosis['categories'];
  games_analyzed: number;
}

export function useDashboardData() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);

    try {
      // Buscar partidas do usuário para mapear played_at nas análises.
      const { data: games, error: gamesErr } = await supabase
        .from('games')
        .select('id, played_at')
        .eq('user_id', profile.id)
        .order('played_at', { ascending: false, nullsFirst: false } as never);

      if (gamesErr) throw gamesErr;

      const gameRows = (games ?? []) as unknown as GameRow[];
      const gameMap = new Map(gameRows.map((g) => [g.id, g.played_at]));

      // Buscar análises concluídas.
      const gameIds = gameRows.map((g) => g.id);
      let analyses: DashboardAnalysis[] = [];

      if (gameIds.length > 0) {
        const { data: analysisData, error: analysisErr } = await supabase
          .from('game_analyses')
          .select('game_id, positions, summary')
          .in('game_id', gameIds)
          .eq('status', 'concluida');

        if (analysisErr) throw analysisErr;

        const analysisRows = (analysisData ?? []) as unknown as AnalysisRow[];
        analyses = analysisRows.map((a) => ({
          gameId: a.game_id,
          playedAt: gameMap.get(a.game_id) ?? null,
          positions: a.positions ?? [],
          summary: a.summary ?? { totalMoves: 0 },
        }));
      }

      // Buscar exercícios salvos.
      const { data: exerciseData, error: exerciseErr } = await supabase
        .from('exercises')
        .select('id, category')
        .eq('user_id', profile.id);

      if (exerciseErr) throw exerciseErr;

      const exercises: DashboardExercise[] = ((exerciseData ?? []) as unknown as ExerciseRow[]).map((e) => ({
        id: e.id,
        category: e.category,
      }));

      // Buscar tentativas de exercícios.
      const { data: attemptData, error: attemptErr } = await supabase
        .from('exercise_attempts')
        .select('exercise_id, is_correct, created_at')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: true });

      if (attemptErr) throw attemptErr;

      const attempts: DashboardAttempt[] = (attemptData ?? []) as unknown as AttemptRow[];

      // Buscar diagnóstico mais recente.
      const { data: diagnosisData } = await supabase
        .from('diagnoses')
        .select('categories, games_analyzed')
        .eq('user_id', profile.id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      let diagnosis: DashboardDiagnosis | null = null;
      if (diagnosisData) {
        const d = diagnosisData as unknown as DiagnosisRow;
        diagnosis = {
          categories: d.categories ?? [],
          gamesAnalyzed: d.games_analyzed ?? 0,
        };
      }

      const result = computeDashboardMetrics(analyses, exercises, attempts, diagnosis);
      setMetrics(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados do painel.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return { loading, error, metrics, reload: load };
}
