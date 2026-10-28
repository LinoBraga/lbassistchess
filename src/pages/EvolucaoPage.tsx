import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Target,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Info,
  BarChart3,
  Activity,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { LoadingState, EmptyState, ErrorState } from '@/components/ui/States';

interface GameRow {
  id: string;
  played_at: string | null;
  white_player: string | null;
  black_player: string | null;
  result: string | null;
}

interface AnalysisRow {
  id: string;
  game_id: string;
  status: string;
  positions: Array<{
    ply: number;
    classification: string | null;
    evalCp: number | null;
    evalMate: number | null;
  }>;
  summary: {
    inaccuracies: number;
    mistakes: number;
    blunders: number;
    accuracyWhite: number | null;
    accuracyBlack: number | null;
    totalMoves: number;
  } | null;
}

interface AttemptRow {
  id: string;
  exercise_id: string;
  is_correct: boolean;
  time_ms: number | null;
  created_at: string;
}

interface PlanSessionRow {
  id: string;
  completed: boolean;
  review_session: boolean;
}

const PERIODS = [
  { value: '30', label: '30 dias' },
  { value: '90', label: '3 meses' },
  { value: '365', label: '1 ano' },
  { value: 'all', label: 'Tudo' },
];

export function EvolucaoPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState('all');
  const [games, setGames] = useState<GameRow[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [attempts, setAttempts] = useState<AttemptRow[]>([]);
  const [sessions, setSessions] = useState<PlanSessionRow[]>([]);

  const loadData = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);

    const periodDays = period === 'all' ? null : parseInt(period, 10);
    const dateFilter = periodDays
      ? new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Load games
    let gameQuery = supabase
      .from('games')
      .select('id, played_at, white_player, black_player, result')
      .eq('user_id', profile.id)
      .order('played_at', { ascending: true, nullsFirst: false } as never);

    if (dateFilter) {
      gameQuery = gameQuery.gte('played_at', dateFilter);
    }

    const { data: gameData, error: gameErr } = await gameQuery;
    if (gameErr) {
      setError(gameErr.message);
      setLoading(false);
      return;
    }
    setGames((gameData ?? []) as unknown as GameRow[]);

    // Load analyses
    const gameIds = (gameData ?? []).map((g) => (g as GameRow).id);
    if (gameIds.length > 0) {
      const { data: analysisData } = await supabase
        .from('game_analyses')
        .select('id, game_id, status, positions, summary')
        .in('game_id', gameIds)
        .eq('status', 'concluida');

      setAnalyses((analysisData ?? []) as unknown as AnalysisRow[]);
    } else {
      setAnalyses([]);
    }

    // Load attempts
    let attemptQuery = supabase
      .from('exercise_attempts')
      .select('id, exercise_id, is_correct, time_ms, created_at')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: true });

    if (dateFilter) {
      attemptQuery = attemptQuery.gte('created_at', dateFilter);
    }

    const { data: attemptData } = await attemptQuery;
    setAttempts((attemptData ?? []) as unknown as AttemptRow[]);

    // Load plan sessions
    const { data: sessionData } = await supabase
      .from('plan_sessions')
      .select('id, completed, review_session')
      .eq('user_id', profile.id);

    setSessions((sessionData ?? []) as unknown as PlanSessionRow[]);

    setLoading(false);
  }, [profile?.id, period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const metrics = useMemo(() => {
    const analyzedGames = analyses.length;
    const totalErrors = analyses.reduce((sum, a) => {
      const positions = a.positions ?? [];
      return sum + positions.filter((p) =>
        p.classification && p.classification !== 'best' && p.classification !== 'excellent'
      ).length;
    }, 0);
    const totalBlunders = analyses.reduce((sum, a) => {
      const positions = a.positions ?? [];
      return sum + positions.filter((p) => p.classification === 'blunder').length;
    }, 0);
    const totalMistakes = analyses.reduce((sum, a) => {
      const positions = a.positions ?? [];
      return sum + positions.filter((p) => p.classification === 'mistake').length;
    }, 0);
    const totalMoves = analyses.reduce((sum, a) =>
      sum + (a.summary?.totalMoves ?? 0), 0);

    const errorRate = totalMoves > 0 ? (totalErrors / totalMoves) * 100 : null;
    const blunderRate = totalMoves > 0 ? (totalBlunders / totalMoves) * 100 : null;

    const totalAttempts = attempts.length;
    const correctAttempts = attempts.filter((a) => a.is_correct).length;
    const accuracy = totalAttempts > 0 ? (correctAttempts / totalAttempts) * 100 : null;

    const completedSessions = sessions.filter((s) => s.completed).length;
    const totalSessions = sessions.length;
    const consistency = totalSessions > 0 ? (completedSessions / totalSessions) * 100 : null;

    // Split analyses into halves for trend comparison
    const midpoint = Math.floor(analyses.length / 2);
    const olderAnalyses = analyses.slice(0, midpoint);
    const recentAnalyses = analyses.slice(midpoint);

    const olderErrorRate = computeErrorRate(olderAnalyses);
    const recentErrorRate = computeErrorRate(recentAnalyses);

    return {
      analyzedGames,
      totalErrors,
      totalBlunders,
      totalMistakes,
      totalMoves,
      errorRate,
      blunderRate,
      totalAttempts,
      correctAttempts,
      accuracy,
      completedSessions,
      totalSessions,
      consistency,
      olderErrorRate,
      recentErrorRate,
      hasEnoughData: analyzedGames >= 5,
      hasEnoughAttempts: totalAttempts >= 5,
      canCompare: analyses.length >= 10,
    };
  }, [analyses, attempts, sessions]);

  if (loading) return <LoadingState label="Carregando evolução…" />;
  if (error) return <ErrorState message={error} onRetry={loadData} />;

  const hasAnyData = metrics.analyzedGames > 0 || metrics.totalAttempts > 0;

  if (!hasAnyData) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Evolução e histórico</h1>
          <p className="text-sm text-content-secondary mt-1">
            Acompanhe seu progresso com base em dados reais
          </p>
        </div>
        <EmptyState
          icon={<TrendingUp className="h-8 w-8" />}
          title="Sem dados de evolução ainda"
          description="Importe, analise partidas e resolva exercícios para começar a acompanhar sua evolução aqui. Todas as métricas são baseadas em dados reais — nada é simulado."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content-primary">Evolução e histórico</h1>
          <p className="text-sm text-content-secondary mt-1">
            Métricas baseadas em dados reais das suas partidas e exercícios
          </p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                period === p.value
                  ? 'bg-brand-500/20 text-brand-200'
                  : 'text-content-secondary hover:bg-ink-raised'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Partidas analisadas"
          value={metrics.analyzedGames}
          icon={Target}
          color="text-brand-300"
        />
        <MetricCard
          label="Taxa de erro"
          value={metrics.errorRate !== null ? `${metrics.errorRate.toFixed(1)}%` : '—'}
          icon={AlertTriangle}
          color="text-orange-400"
          subtitle={metrics.totalMoves > 0 ? `${metrics.totalErrors} erros / ${metrics.totalMoves} lances` : undefined}
        />
        <MetricCard
          label="Taxa de erros graves"
          value={metrics.blunderRate !== null ? `${metrics.blunderRate.toFixed(1)}%` : '—'}
          icon={TrendingDown}
          color="text-danger-400"
          subtitle={metrics.totalBlunders > 0 ? `${metrics.totalBlunders} erros graves` : undefined}
        />
        <MetricCard
          label="Acurácia em exercícios"
          value={metrics.accuracy !== null ? `${metrics.accuracy.toFixed(0)}%` : '—'}
          icon={CheckCircle2}
          color="text-success-400"
          subtitle={metrics.totalAttempts > 0 ? `${metrics.correctAttempts}/${metrics.totalAttempts}` : undefined}
        />
      </div>

      {/* Sample size warning */}
      {!metrics.hasEnoughData && (
        <div className="card p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-warning-300 shrink-0 mt-0.5" />
          <p className="text-xs text-content-secondary leading-relaxed">
            Amostra insuficiente ({metrics.analyzedGames} partida(s) analisada(s)). Para métricas confiáveis,
            recomendamos pelo menos 5 partidas analisadas. Os valores atuais podem não representar
            tendências consistentes.
          </p>
        </div>
      )}

      {/* Error rate trend */}
      {metrics.canCompare && (
        <div className="card p-5">
          <h2 className="text-base font-bold text-content-primary flex items-center gap-2 mb-4">
            <BarChart3 className="h-4.5 w-4.5 text-brand-300" />
            Tendência da taxa de erro
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <TrendBlock
              label="Primeira metade das partidas"
              errorRate={metrics.olderErrorRate}
            />
            <TrendBlock
              label="Segunda metade das partidas"
              errorRate={metrics.recentErrorRate}
            />
          </div>
          {metrics.olderErrorRate !== null && metrics.recentErrorRate !== null && (
            <div className="mt-4 flex items-center gap-2">
              {metrics.recentErrorRate < metrics.olderErrorRate ? (
                <>
                  <TrendingDown className="h-4 w-4 text-success-400" />
                  <span className="text-sm text-success-400">
                    Melhora: taxa de erro caiu {(metrics.olderErrorRate - metrics.recentErrorRate).toFixed(1)} pontos percentuais
                  </span>
                </>
              ) : metrics.recentErrorRate > metrics.olderErrorRate ? (
                <>
                  <TrendingUp className="h-4 w-4 text-danger-400" />
                  <span className="text-sm text-danger-400">
                    Piora: taxa de erro subiu {(metrics.recentErrorRate - metrics.olderErrorRate).toFixed(1)} pontos percentuais
                  </span>
                </>
              ) : (
                <span className="text-sm text-content-secondary">Taxa de erro estável</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Exercise performance */}
      {metrics.totalAttempts > 0 && (
        <div className="card p-5">
          <h2 className="text-base font-bold text-content-primary flex items-center gap-2 mb-4">
            <Activity className="h-4.5 w-4.5 text-cyan-400" />
            Desempenho em exercícios
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-content-primary">{metrics.totalAttempts}</p>
              <p className="text-xs text-content-secondary mt-1">Tentativas</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-success-400">{metrics.correctAttempts}</p>
              <p className="text-xs text-content-secondary mt-1">Acertos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-danger-400">{metrics.totalAttempts - metrics.correctAttempts}</p>
              <p className="text-xs text-content-secondary mt-1">Erros</p>
            </div>
          </div>
          {!metrics.hasEnoughAttempts && (
            <p className="text-xs text-content-muted mt-3 italic">
              Amostra de {metrics.totalAttempts} tentativa(s) — pouca para tendências confiáveis.
            </p>
          )}
        </div>
      )}

      {/* Training consistency */}
      {metrics.totalSessions > 0 && (
        <div className="card p-5">
          <h2 className="text-base font-bold text-content-primary flex items-center gap-2 mb-4">
            <Clock className="h-4.5 w-4.5 text-warning-300" />
            Consistência de treino
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="w-full h-2 bg-ink-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all"
                  style={{ width: `${metrics.consistency ?? 0}%` }}
                />
              </div>
            </div>
            <span className="text-sm font-semibold text-content-primary">
              {metrics.consistency !== null ? `${metrics.consistency.toFixed(0)}%` : '—'}
            </span>
          </div>
          <p className="text-xs text-content-secondary mt-2">
            {metrics.completedSessions} de {metrics.totalSessions} sessões concluídas
          </p>
        </div>
      )}

      {/* Rating disclaimer */}
      <div className="card p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-content-muted shrink-0 mt-0.5" />
        <p className="text-xs text-content-secondary leading-relaxed">
          As métricas aqui são baseadas em análises do Stockfish e nos seus resultados em exercícios.
          Elas não representam seu rating oficial de Chess.com ou Lichess. Pequenas amostras podem
          não refletir tendências reais — sempre considere o tamanho da amostra ao interpretar.
        </p>
      </div>
    </div>
  );
}

function computeErrorRate(analyses: AnalysisRow[]): number | null {
  if (analyses.length === 0) return null;
  let totalErrors = 0;
  let totalMoves = 0;
  for (const a of analyses) {
    const positions = a.positions ?? [];
    totalErrors += positions.filter((p) =>
      p.classification && p.classification !== 'best' && p.classification !== 'excellent'
    ).length;
    totalMoves += a.summary?.totalMoves ?? positions.length;
  }
  return totalMoves > 0 ? (totalErrors / totalMoves) * 100 : null;
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: typeof Target;
  color: string;
  subtitle?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-content-muted mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      {subtitle && <p className="text-xs text-content-muted mt-1">{subtitle}</p>}
    </div>
  );
}

function TrendBlock({ label, errorRate }: { label: string; errorRate: number | null }) {
  return (
    <div className="rounded-xl bg-ink-raised border border-ink-border p-4">
      <p className="text-xs text-content-secondary mb-2">{label}</p>
      <p className="text-xl font-bold text-content-primary">
        {errorRate !== null ? `${errorRate.toFixed(1)}%` : '—'}
      </p>
      <p className="text-xs text-content-muted mt-1">taxa de erro por lance</p>
    </div>
  );
}
