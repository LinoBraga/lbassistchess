import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { CategoryDiagnosis } from '@/lib/diagnosis';

export interface TrainingDay {
  day: number;
  dayLabel: string;
  sessions: TrainingSession[];
}

export interface TrainingSession {
  category: string;
  categoryLabel: string;
  exerciseIds: string[];
  isReview: boolean;
  reason: string;
}

export interface TrainingPlan {
  id: string | null;
  weekStart: string;
  minutesPerDay: number;
  days: TrainingDay[];
  diagnosisVersion: number;
  isProvisional: boolean;
}

export interface PlanSessionRow {
  id: string;
  day: number;
  category: string;
  exercise_ids: string[];
  completed: boolean;
  completed_at: string | null;
  review_session: boolean;
}

const DAY_LABELS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

export function useTrainingPlan(diagnosis: CategoryDiagnosis[] | null, diagnosisVersion: number) {
  const { profile } = useAuth();
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [sessions, setSessions] = useState<PlanSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const loadPlan = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);

    const today = new Date();
    const weekStart = getWeekStart(today);

    const { data: existing } = await supabase
      .from('training_plans')
      .select('*')
      .eq('user_id', profile.id)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (existing) {
      const planData = existing as {
        id: string;
        week_start: string;
        minutes_per_day: number;
        days: TrainingDay[];
        diagnosis_version: number;
        is_provisional: boolean;
      };

      const { data: sessionRows } = await supabase
        .from('plan_sessions')
        .select('*')
        .eq('plan_id', planData.id);

      setPlan({
        id: planData.id,
        weekStart: planData.week_start,
        minutesPerDay: planData.minutes_per_day,
        days: planData.days ?? [],
        diagnosisVersion: planData.diagnosis_version,
        isProvisional: planData.is_provisional,
      });
      setSessions((sessionRows ?? []) as unknown as PlanSessionRow[]);
    }

    setLoading(false);
  }, [profile?.id]);

  const generatePlan = useCallback(async () => {
    if (!profile?.id) return;
    setGenerating(true);

    // Buscar preferências
    const { data: prefs } = await supabase
      .from('training_preferences')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();

    const minutesPerDay = (prefs as { minutes_per_day?: number } | null)?.minutes_per_day ?? 15;

    // Buscar exercícios do usuário
    const { data: exercisesData } = await supabase
      .from('exercises')
      .select('id, category, difficulty')
      .eq('user_id', profile.id);

    const exercises = (exercisesData ?? []) as { id: string; category: string; difficulty: string }[];

    // Buscar tentativas anteriores para revisão
    const { data: attempts } = await supabase
      .from('exercise_attempts')
      .select('exercise_id, is_correct')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });

    const attemptMap = new Map<string, boolean>();
    for (const a of (attempts ?? []) as { exercise_id: string; is_correct: boolean }[]) {
      if (!attemptMap.has(a.exercise_id)) {
        attemptMap.set(a.exercise_id, a.is_correct);
      }
    }

    const weekStart = getWeekStart(new Date());

    // Priorizar categorias do diagnóstico
    let categoriesToTrain: { category: string; reason: string }[] = [];

    if (diagnosis && diagnosis.length > 0) {
      categoriesToTrain = diagnosis.slice(0, 3).map((c) => ({
        category: c.category,
        reason: `Fraqueza identificada: ${c.categoryLabel} (${c.occurrences} ocorrências)`,
      }));
    }

    const isProvisional = categoriesToTrain.length === 0;

    // Se não há diagnóstico, usar categorias variadas
    if (isProvisional && exercises.length > 0) {
      const uniqueCategories = [...new Set(exercises.map((e) => e.category))];
      categoriesToTrain = uniqueCategories.slice(0, 3).map((c) => ({
        category: c,
        reason: 'Plano provisório — análise insuficiente para personalização',
      }));
    }

    // Distribuir exercícios por dias (7 dias)
    const days: TrainingDay[] = [];
    const exercisesByCategory = new Map<string, string[]>();
    for (const ex of exercises) {
      const existing = exercisesByCategory.get(ex.category) ?? [];
      existing.push(ex.id);
      exercisesByCategory.set(ex.category, existing);
    }

    for (let d = 0; d < 7; d++) {
      const daySessions: TrainingSession[] = [];

      // Determinar categorias do dia
      const categoriesToday = isProvisional
        ? categoriesToTrain
        : [
          categoriesToTrain[d % categoriesToTrain.length] ?? categoriesToTrain[0],
          ...(d === 2 || d === 5 ? [categoriesToTrain[(d + 1) % categoriesToTrain.length] ?? categoriesToTrain[0]] : []),
        ];

      // Sessões de exercícios novos
      for (const cat of categoriesToday) {
        if (!cat) continue;
        const exIds = exercisesByCategory.get(cat.category) ?? [];
        const newExIds = exIds.filter((id) => !attemptMap.has(id));

        if (newExIds.length > 0) {
          daySessions.push({
            category: cat.category,
            categoryLabel: getLabelFromCategory(cat.category),
            exerciseIds: newExIds.slice(0, 3),
            isReview: false,
            reason: cat.reason,
          });
        }
      }

      // Revisão aos sábados e domingos
      if ((d === 5 || d === 6) && !isProvisional) {
        const reviewIds = [...attemptMap.entries()]
          .filter(([, correct]) => !correct)
          .map(([id]) => id);

        if (reviewIds.length > 0) {
          daySessions.push({
            category: 'revisao',
            categoryLabel: 'Revisão',
            exerciseIds: reviewIds.slice(0, 3),
            isReview: true,
            reason: 'Revisão de exercícios incorretos',
          });
        }
      }

      days.push({
        day: d,
        dayLabel: DAY_LABELS[d],
        sessions: daySessions,
      });
    }

    // Salvar plano
    const { data: newPlan, error } = await supabase
      .from('training_plans')
      .insert({
        user_id: profile.id,
        week_start: weekStart,
        minutes_per_day: minutesPerDay,
        days: days as unknown as never,
        diagnosis_version: diagnosisVersion,
        is_provisional: isProvisional,
      })
      .select('id')
      .single();

    if (error) {
      setGenerating(false);
      return;
    }

    // Salvar sessões
    const sessionRows: {
      user_id: string;
      plan_id: string;
      day: number;
      category: string;
      exercise_ids: string[];
      review_session: boolean;
    }[] = [];

    for (const day of days) {
      for (const session of day.sessions) {
        sessionRows.push({
          user_id: profile.id,
          plan_id: newPlan.id,
          day: day.day,
          category: session.category,
          exercise_ids: session.exerciseIds,
          review_session: session.isReview,
        });
      }
    }

    if (sessionRows.length > 0) {
      await supabase.from('plan_sessions').insert(sessionRows);
    }

    setPlan({
      id: newPlan.id,
      weekStart,
      minutesPerDay: minutesPerDay,
      days,
      diagnosisVersion,
      isProvisional,
    });

    // Recarregar sessões
    const { data: sRows } = await supabase
      .from('plan_sessions')
      .select('*')
      .eq('plan_id', newPlan.id);

    setSessions((sRows ?? []) as unknown as PlanSessionRow[]);
    setGenerating(false);
  }, [profile?.id, diagnosis, diagnosisVersion]);

  const toggleSession = useCallback(async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    const newCompleted = !session.completed;
    await supabase
      .from('plan_sessions')
      .update({
        completed: newCompleted,
        completed_at: newCompleted ? new Date().toISOString() : null,
      })
      .eq('id', sessionId);

    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
          : s,
      ),
    );
  }, [sessions]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  return {
    plan,
    sessions,
    loading,
    generating,
    generatePlan,
    toggleSession,
    reload: loadPlan,
  };
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

function getLabelFromCategory(cat: string): string {
  const labels: Record<string, string> = {
    tatica: 'Táticas',
    pecas_indefesas: 'Peças indefesas',
    calculo: 'Cálculo',
    abertura: 'Abertura',
    estrategia: 'Estratégia',
    estrutura_peoes: 'Estruturas de peões',
    conversao: 'Conversão',
    defesa: 'Defesa',
    finais: 'Finais',
    revisao: 'Revisão',
  };
  return labels[cat] ?? cat;
}
