import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  computeDiagnosis,
  type Diagnosis,
  type GameAnalysisData,
  type CategoryDiagnosis,
} from '@/lib/diagnosis';
import { generateExercises, type GeneratedExercise } from '@/lib/exercises';

interface StoredDiagnosis {
  id: string;
  version: number;
  categories: CategoryDiagnosis[];
  games_analyzed: number;
  computed_at: string;
}

interface StoredAnalysis {
  id: string;
  game_id: string;
  positions: GameAnalysisData['positions'];
  summary: GameAnalysisData['summary'];
}

interface GameRow {
  id: string;
  played_at: string | null;
}

export function useDiagnosis() {
  const { profile } = useAuth();
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [storedVersion, setStoredVersion] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exercises, setExercises] = useState<GeneratedExercise[]>([]);

  const loadDiagnosis = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    // Carregar diagnóstico salvo
    const { data: stored } = await supabase
      .from('diagnoses')
      .select('*')
      .eq('user_id', profile.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (stored) {
      const s = stored as unknown as StoredDiagnosis;
      setStoredVersion(s.version);
      setDiagnosis({
        categories: s.categories,
        gamesAnalyzed: s.games_analyzed,
        totalErrors: s.categories.reduce((sum, c) => sum + c.occurrences, 0),
        totalBlunders: s.categories.reduce((sum, c) =>
          sum + c.examplePositions.filter((p) => p.classification === 'blunder').length, 0),
        totalMistakes: s.categories.reduce((sum, c) =>
          sum + c.examplePositions.filter((p) => p.classification === 'mistake').length, 0),
        totalInaccuracies: s.categories.reduce((sum, c) =>
          sum + c.examplePositions.filter((p) => p.classification === 'inaccuracy').length, 0),
      });
    }

    setLoading(false);
  }, [profile?.id]);

  const computeDiagnosisNow = useCallback(async () => {
    if (!profile?.id) return;
    setComputing(true);
    setError(null);

    try {
      // Buscar partidas com análise concluída
      const { data: games } = await supabase
        .from('games')
        .select('id, played_at')
        .eq('user_id', profile.id)
        .order('played_at', { ascending: false, nullsFirst: false } as never)
        .eq('analysis_status', 'concluida');

      const gameRows = (games ?? []) as unknown as GameRow[];
      if (gameRows.length === 0) {
        setError('Nenhuma partida analisada encontrada. Importe e analise partidas para gerar um diagnóstico.');
        setComputing(false);
        return;
      }

      // Buscar análises concluídas
      const gameIds = gameRows.map((g) => g.id);
      const { data: analyses } = await supabase
        .from('game_analyses')
        .select('id, game_id, positions, summary')
        .in('game_id', gameIds)
        .eq('status', 'concluida');

      const storedAnalyses = (analyses ?? []) as unknown as StoredAnalysis[];
      if (storedAnalyses.length === 0) {
        setError('Nenhuma análise concluída encontrada. Analise partidas para gerar um diagnóstico.');
        setComputing(false);
        return;
      }

      // Construir dados para o diagnóstico
      const gameData: GameAnalysisData[] = storedAnalyses.map((a) => ({
        gameId: a.game_id,
        playedAt: gameRows.find((g) => g.id === a.game_id)?.played_at ?? null,
        positions: a.positions ?? [],
        summary: a.summary ?? {
          inaccuracies: 0, mistakes: 0, blunders: 0,
          accuracyWhite: null, accuracyBlack: null, totalMoves: 0,
        },
      }));

      const result = computeDiagnosis(gameData);

      // Salvar diagnóstico
      const newVersion = storedVersion + 1;
      const { error: saveError } = await supabase.from('diagnoses').insert({
        user_id: profile.id,
        version: newVersion,
        categories: result.categories,
        games_analyzed: result.gamesAnalyzed,
      });

      if (saveError) {
        setError('Erro ao salvar diagnóstico: ' + saveError.message);
        setComputing(false);
        return;
      }

      setDiagnosis(result);
      setStoredVersion(newVersion);

      // Gerar exercícios a partir dos erros
      const newExercises = generateExercises(gameData, 20);
      setExercises(newExercises);

      // Salvar exercícios no banco (ignorar duplicatas)
      if (newExercises.length > 0) {
        const exerciseRows = newExercises.map((ex) => ({
          user_id: profile.id,
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

        // Inserir ignorando conflitos de duplicata
        await supabase.from('exercises').upsert(exerciseRows, {
          onConflict: 'user_id,game_id,source_ply',
          ignoreDuplicates: true,
        });
      }

      setComputing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao computar diagnóstico');
      setComputing(false);
    }
  }, [profile?.id, storedVersion]);

  useEffect(() => {
    loadDiagnosis();
  }, [loadDiagnosis]);

  return {
    diagnosis,
    storedVersion,
    loading,
    computing,
    error,
    exercises,
    computeDiagnosis: computeDiagnosisNow,
    reload: loadDiagnosis,
  };
}
