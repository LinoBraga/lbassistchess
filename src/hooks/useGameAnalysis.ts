import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useUsageCheck } from '@/hooks/useUsageCheck';
import {
  GameAnalyzer,
  DEFAULT_CONFIG,
  type AnalysisConfig,
  type FullAnalysis,
  type PositionAnalysis,
  type AnalysisProgress,
} from '@/lib/analysis';
import { generateExercises } from '@/lib/exercises';
import type { GameAnalysisData } from '@/lib/diagnosis';

export type AnalysisStatus = 'idle' | 'loading_existing' | 'aguardando' | 'em_andamento' | 'concluida' | 'cancelada' | 'falhou';

export interface GameAnalysisState {
  status: AnalysisStatus;
  analysis: FullAnalysis | null;
  progress: { current: number; total: number } | null;
  error: string | null;
  analysisId: string | null;
}

export interface StoredAnalysis {
  id: string;
  game_id: string;
  engine_name: string;
  engine_version: string;
  engine_config: AnalysisConfig;
  status: string;
  positions: PositionAnalysis[];
  summary: FullAnalysis['summary'] | null;
  progress: number;
  error_message: string | null;
}

const ENGINE_VERSION = '19.0.1';

export function useGameAnalysis(gameId: string | undefined) {
  const { profile } = useAuth();
  const { checkUsage, incrementUsage } = useUsageCheck();
  const [state, setState] = useState<GameAnalysisState>({
    status: 'idle',
    analysis: null,
    progress: null,
    error: null,
    analysisId: null,
  });

  const analyzerRef = useRef<GameAnalyzer | null>(null);
  const cancelledRef = useRef(false);

  // Carregar análise existente ao montar
  const loadExisting = useCallback(async () => {
    if (!gameId || !profile?.id) return;

    setState((s) => ({ ...s, status: 'loading_existing' }));

    const { data, error } = await supabase
      .from('game_analyses')
      .select('*')
      .eq('game_id', gameId)
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setState((s) => ({ ...s, status: 'idle', error: error.message }));
      return;
    }

    if (!data) {
      setState((s) => ({ ...s, status: 'idle' }));
      return;
    }

    const stored = data as unknown as StoredAnalysis;

    if (stored.status === 'concluida' && stored.positions?.length > 0) {
      setState({
        status: 'concluida',
        analysis: {
          positions: stored.positions,
          summary: stored.summary ?? emptySummary(),
        },
        progress: null,
        error: null,
        analysisId: stored.id,
      });
      return;
    }

    if (stored.status === 'em_andamento' || stored.status === 'aguardando') {
      // Análise interrompida — pode retomar
      setState({
        status: 'idle',
        analysis: stored.positions?.length > 0
          ? { positions: stored.positions, summary: stored.summary ?? emptySummary() }
          : null,
        progress: null,
        error: null,
        analysisId: stored.id,
      });
      return;
    }

    if (stored.status === 'falhou') {
      setState({
        status: 'idle',
        analysis: null,
        progress: null,
        error: stored.error_message ?? 'Análise anterior falhou.',
        analysisId: stored.id,
      });
      return;
    }

    if (stored.status === 'cancelada') {
      setState({
        status: 'cancelada',
        analysis: stored.positions?.length > 0
          ? { positions: stored.positions, summary: stored.summary ?? emptySummary() }
          : null,
        progress: null,
        error: null,
        analysisId: stored.id,
      });
      return;
    }

    setState((s) => ({ ...s, status: 'idle' }));
  }, [gameId, profile?.id]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  // Iniciar análise
  const startAnalysis = useCallback(
    async (pgn: string, config?: Partial<AnalysisConfig>) => {
      if (!gameId || !profile?.id) return;

      cancelledRef.current = false;
      const fullConfig = { ...DEFAULT_CONFIG, ...config };

      // Verificar limite de uso no backend antes de iniciar
      const usage = await checkUsage();
      if (usage && !usage.can_analyze) {
        setState((s) => ({
          ...s,
          status: 'falhou',
          error: `Você atingiu o limite de ${usage.limit} análises neste mês.`,
        }));
        return;
      }

      setState((s) => ({ ...s, status: 'aguardando', error: null, progress: null }));

      // Criar registro de análise no banco
      const { data: existingActive } = await supabase
        .from('game_analyses')
        .select('id')
        .eq('game_id', gameId)
        .eq('user_id', profile.id)
        .in('status', ['aguardando', 'em_andamento', 'concluida'])
        .maybeSingle();

      let analysisId: string;

      if (existingActive) {
        // Já existe análise ativa/concluída — atualizar para em_andamento se for retomar,
        // ou não fazer nada se já concluída
        const { data: fullExisting } = await supabase
          .from('game_analyses')
          .select('*')
          .eq('id', existingActive.id)
          .maybeSingle();

        if (fullExisting?.status === 'concluida') {
          // Não reanalisar
          loadExisting();
          return;
        }

        analysisId = existingActive.id;
        await supabase
          .from('game_analyses')
          .update({ status: 'em_andamento', engine_config: fullConfig, progress: 0 })
          .eq('id', analysisId);
      } else {
        const { data, error } = await supabase.from('game_analyses').insert({
          game_id: gameId,
          user_id: profile.id,
          engine_name: 'Stockfish',
          engine_version: ENGINE_VERSION,
          engine_config: fullConfig,
          status: 'em_andamento',
          positions: [],
          progress: 0,
        }).select('id').single();

        if (error) {
          setState((s) => ({ ...s, status: 'falhou', error: error.message }));
          return;
        }
        analysisId = data.id;
      }

      setState((s) => ({
        ...s,
        status: 'em_andamento',
        analysisId,
        progress: { current: 0, total: 0 },
      }));

      // Inicializar analyzer
      const analyzer = new GameAnalyzer();
      analyzerRef.current = analyzer;

      try {
        await analyzer.init();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Falha ao inicializar Stockfish';
        setState((s) => ({ ...s, status: 'falhou', error: message }));
        await supabase
          .from('game_analyses')
          .update({ status: 'falhou', error_message: message })
          .eq('id', analysisId);
        analyzer.terminate();
        return;
      }

      // Analisar a partida
      try {
        const result = await analyzer.analyzeGame(
          pgn,
          fullConfig,
          (progress: AnalysisProgress) => {
            if (cancelledRef.current) return;

            setState((s) => ({
              ...s,
              progress: { current: progress.current, total: progress.total },
              analysis: {
                positions: progress.position
                  ? [...(s.analysis?.positions ?? []), progress.position].slice(-progress.current)
                  : s.analysis?.positions ?? [],
                summary: s.analysis?.summary ?? emptySummary(),
              },
            }));

            // Salvar progresso parcial a cada 5 posições
            if (progress.current % 5 === 0) {
              setState((currentState) => {
                const partialPositions = collectPartialPositions(
                  progress.current,
                  progress.position,
                  currentState.analysis?.positions ?? [],
                );
                const pct = Math.round((progress.current / progress.total) * 100);
                supabase
                  .from('game_analyses')
                  .update({
                    positions: partialPositions,
                    progress: pct,
                  })
                  .eq('id', analysisId)
                  .then();
                return currentState;
              });
            }
          },
        );

        if (cancelledRef.current) {
          // Foi cancelado
          await supabase
            .from('game_analyses')
            .update({
              status: 'cancelada',
              positions: result.positions,
              progress: Math.round((state.progress?.current ?? 0) / (state.progress?.total ?? 1) * 100),
            })
            .eq('id', analysisId);
          setState((s) => ({ ...s, status: 'cancelada', analysis: result }));
          return;
        }

        // Salvar resultado final
        await supabase
          .from('game_analyses')
          .update({
            status: 'concluida',
            positions: result.positions,
            summary: result.summary,
            progress: 100,
          })
          .eq('id', analysisId);

        // Atualizar status do jogo
        await supabase
          .from('games')
          .update({ analysis_status: 'concluida' })
          .eq('id', gameId)
          .eq('user_id', profile.id);

        // Incrementar consumo no backend
        await incrementUsage(gameId);

        // Gerar exercícios automaticamente a partir dos erros da partida
        await autoGenerateExercises(gameId, profile.id, result);

        setState((s) => ({
          ...s,
          status: 'concluida',
          analysis: result,
          progress: null,
          error: null,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro durante a análise';
        const isCancelled = message === 'cancelled';

        if (isCancelled) {
          await supabase
            .from('game_analyses')
            .update({ status: 'cancelada' })
            .eq('id', analysisId);
          setState((s) => ({ ...s, status: 'cancelada' }));
        } else {
          await supabase
            .from('game_analyses')
            .update({ status: 'falhou', error_message: message })
            .eq('id', analysisId);
          setState((s) => ({ ...s, status: 'falhou', error: message }));
        }
      } finally {
        analyzer.terminate();
        analyzerRef.current = null;
      }
    },
    [gameId, profile?.id, loadExisting, checkUsage, incrementUsage],
  );

  // Cancelar análise
  const cancelAnalysis = useCallback(() => {
    cancelledRef.current = true;
    analyzerRef.current?.cancel();
    setState((s) => ({ ...s, status: 'cancelada' }));
  }, []);

  // Retomar análise cancelada
  const resumeAnalysis = useCallback(
    async (pgn: string, config?: Partial<AnalysisConfig>) => {
      // Deletar análise cancelada anterior e iniciar nova
      if (state.analysisId) {
        await supabase
          .from('game_analyses')
          .update({ status: 'falhou', error_message: 'Retomada' })
          .eq('id', state.analysisId);
      }
      await startAnalysis(pgn, config);
    },
    [state.analysisId, startAnalysis],
  );

  // Limpar ao desmontar
  useEffect(() => {
    return () => {
      analyzerRef.current?.terminate();
    };
  }, []);

  return {
    state,
    startAnalysis,
    cancelAnalysis,
    resumeAnalysis,
    reload: loadExisting,
  };
}

function emptySummary(): FullAnalysis['summary'] {
  return {
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracies: 0,
    mistakes: 0,
    blunders: 0,
    accuracyWhite: null,
    accuracyBlack: null,
    totalMoves: 0,
    analyzedAt: new Date().toISOString(),
  };
}

function collectPartialPositions(
  current: number,
  latest: PositionAnalysis | null,
  previous: PositionAnalysis[],
): PositionAnalysis[] {
  if (latest && previous.length < current) {
    return [...previous, latest];
  }
  return previous.slice(0, current);
}

async function autoGenerateExercises(
  gameId: string,
  userId: string,
  result: FullAnalysis,
): Promise<void> {
  const gameData: GameAnalysisData = {
    gameId,
    playedAt: null,
    positions: result.positions,
    summary: {
      inaccuracies: result.summary.inaccuracies,
      mistakes: result.summary.mistakes,
      blunders: result.summary.blunders,
      accuracyWhite: result.summary.accuracyWhite,
      accuracyBlack: result.summary.accuracyBlack,
      totalMoves: result.summary.totalMoves,
    },
  };

  const newExercises = generateExercises([gameData], 20);
  if (newExercises.length === 0) return;

  const exerciseRows = newExercises.map((ex) => ({
    user_id: userId,
    game_id: ex.gameId,
    source_ply: ex.sourcePly,
    fen: ex.fen,
    side_to_move: ex.sideToMove,
    best_move: ex.bestMove,
    acceptable_moves: ex.acceptableMoves,
    pv: ex.pv,
    category: ex.category,
    difficulty: ex.difficulty,
    instruction: ex.instruction,
    explanation: ex.explanation,
  }));

  await supabase.from('exercises').upsert(exerciseRows, {
    onConflict: 'user_id,game_id,source_ply',
    ignoreDuplicates: true,
  });
}
