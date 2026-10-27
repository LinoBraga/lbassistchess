import { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { PositionAnalysis } from '@/lib/analysis';
import {
  computeOpeningFrequency,
  computeCriticalPositions,
  computeVariantTrees,
  type GameForRepertoire,
  type AnalysisForRepertoire,
  type OpeningStat,
  type CriticalPosition,
  type VariantTree,
} from '@/lib/openings';

interface RepertoireState {
  loading: boolean;
  error: string | null;
  games: GameForRepertoire[];
  analyses: AnalysisForRepertoire[];
}

export type PeriodFilter = 'all' | '30d' | '90d';
export type TimeControlFilter = 'all' | 'blitz' | 'rapid' | 'classical';

export function useRepertoire() {
  const { profile } = useAuth();
  const [state, setState] = useState<RepertoireState>({
    loading: true,
    error: null,
    games: [],
    analyses: [],
  });
  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [timeControl, setTimeControl] = useState<TimeControlFilter>('all');

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('id, pgn, white_player, black_player, result, played_at, time_control, user_color, opening_name, opening_eco')
        .eq('user_id', profile.id)
        .order('played_at', { ascending: false, nullsFirst: false } as never);

      if (gamesError) {
        setState((s) => ({ ...s, loading: false, error: gamesError.message }));
        return;
      }

      const gameRows = (games ?? []) as unknown as GameForRepertoire[];

      const gameIds = gameRows.map((g) => g.id);
      const analyses: AnalysisForRepertoire[] = [];

      if (gameIds.length > 0) {
        const { data: analysisData, error: analysisError } = await supabase
          .from('game_analyses')
          .select('game_id, positions')
          .in('game_id', gameIds)
          .eq('status', 'concluida');

        if (!analysisError && analysisData) {
          for (const row of analysisData as unknown as { game_id: string; positions: PositionAnalysis[] | null }[]) {
            analyses.push({ game_id: row.game_id, positions: row.positions ?? [] });
          }
        }
      }

      setState({ loading: false, error: null, games: gameRows, analyses });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Erro ao carregar dados' }));
    }
  }, [profile?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const openings = useMemo<OpeningStat[]>(
    () => computeOpeningFrequency(state.games, { period, timeControl }),
    [state.games, period, timeControl],
  );

  const criticalPositions = useMemo<CriticalPosition[]>(
    () => computeCriticalPositions(state.games, state.analyses),
    [state.games, state.analyses],
  );

  const variantTrees = useMemo<{ asWhite: VariantTree; asBlack: VariantTree }>(
    () => computeVariantTrees(state.games, state.analyses),
    [state.games, state.analyses],
  );

  const totalGames = state.games.length;
  const gamesWithOpenings = state.games.filter((g) => {
    if (g.opening_name && g.opening_name !== '?') return true;
    const headerName = g.pgn.match(/\[Opening\s+"([^"]*)"\]/);
    return headerName && headerName[1] && headerName[1] !== '?';
  }).length;
  const gamesWithAnalysis = state.analyses.length;

  return {
    ...state,
    reload: load,
    period,
    setPeriod,
    timeControl,
    setTimeControl,
    openings,
    criticalPositions,
    variantTrees,
    totalGames,
    gamesWithOpenings,
    gamesWithAnalysis,
  };
}
