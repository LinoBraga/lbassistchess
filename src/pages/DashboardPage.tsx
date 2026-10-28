import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Target,
  Search,
  Dumbbell,
  BarChart3,
  BookOpen,
  TrendingUp,
  Brain,
  Clock,
  Lightbulb,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Plus,
  Download,
  CheckCircle2,
  XCircle,
  Info,
  TrendingDown,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { LoadingState, EmptyState, Skeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { SkillIndicator } from '@/lib/dashboard';

export function DashboardPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accountsCount, setAccountsCount] = useState(0);
  const [gamesCount, setGamesCount] = useState(0);
  const [hasPrefs, setHasPrefs] = useState(false);
  const { metrics, loading: metricsLoading, error } = useDashboardData();

  useEffect(() => {
    let active = true;
    (async () => {
      if (!profile?.id) return;
      const [accounts, games, prefs] = await Promise.all([
        supabase.from('external_accounts').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
        supabase.from('games').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
        supabase.from('training_preferences').select('user_id', { count: 'exact', head: true }).eq('user_id', profile.id),
      ]);
      if (!active) return;
      setAccountsCount(accounts.count ?? 0);
      setGamesCount(games.count ?? 0);
      setHasPrefs((prefs.count ?? 0) > 0);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [profile?.id]);

  const firstName = (profile?.display_name || profile?.email || '').split('@')[0];
  const hasData = gamesCount > 0;
  const isLoading = loading || metricsLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <section>
          <h1 className="text-2xl sm:text-3xl font-bold text-content-primary">
            Seu próximo nível começa aqui.
          </h1>
        </section>
        <div className="space-y-6">
          <Skeleton className="h-40" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 animate-fade-in">
        <section>
          <h1 className="text-2xl sm:text-3xl font-bold text-content-primary">
            Seu próximo nível começa aqui.
          </h1>
        </section>
        <div className="card p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-warning-300 mx-auto mb-3" />
          <p className="text-sm text-content-secondary">
            Não foi possível carregar os dados do painel: {error}
          </p>
          <p className="text-xs text-content-muted mt-2">
            Verifique sua conexão e tente novamente.
          </p>
        </div>
        <Shortcuts />
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="space-y-6 animate-fade-in">
        <section>
          <h1 className="text-2xl sm:text-3xl font-bold text-content-primary">
            Seu próximo nível começa aqui.
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-content-secondary">
            Vamos trabalhar na habilidade que mais pode ajudar seu jogo hoje.
          </p>
        </section>
        <EmptyDashboard firstName={firstName} accountsCount={accountsCount} gamesCount={gamesCount} hasPrefs={hasPrefs} />
        <Shortcuts />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <section>
        <h1 className="text-2xl sm:text-3xl font-bold text-content-primary">
          Seu próximo nível começa aqui.
        </h1>
        <p className="mt-1.5 text-sm sm:text-base text-content-secondary">
          Vamos trabalhar na habilidade que mais pode ajudar seu jogo hoje.
        </p>
      </section>

      <div className="space-y-6">
        {metrics && <DailyTraining metrics={metrics} />}
        {metrics && (
          <div className="grid lg:grid-cols-2 gap-5">
            <SkillsFocus skills={metrics.skills} />
            <AttentionPoint metrics={metrics} />
          </div>
        )}
        {metrics && <RecentEvolution metrics={metrics} />}
        <Shortcuts />
      </div>
    </div>
  );
}

/* --------------------------------------------- Empty state (no games) */
function EmptyDashboard({
  firstName,
  accountsCount,
  gamesCount,
  hasPrefs,
}: {
  firstName: string;
  accountsCount: number;
  gamesCount: number;
  hasPrefs: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="card-raised p-8 text-center">
        <div className="h-14 w-14 rounded-2xl gradient-brand mx-auto flex items-center justify-center mb-4">
          <Sparkles className="h-7 w-7 text-white" />
        </div>
        <h2 className="text-xl font-bold text-content-primary">
          Olá, {firstName}! Vamos começar.
        </h2>
        <p className="mt-2 text-sm text-content-secondary max-w-md mx-auto">
          Para gerar seu diagnóstico personalizado, precisamos das suas partidas.
          Importe agora — leva menos de um minuto.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/app/analises">
            <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
              Importar partidas
            </Button>
          </Link>
          {!hasPrefs && (
            <Link to="/onboarding">
              <Button variant="secondary">Configurar preferências</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatusCard icon={Download} label="Partidas importadas" value={String(gamesCount)} hint={gamesCount === 0 ? 'Importe um arquivo PGN' : 'Pronto para análise'} />
        <StatusCard icon={Search} label="Contas conectadas" value={String(accountsCount)} hint={accountsCount === 0 ? 'Chess.com ou Lichess' : 'Pronto para importar'} />
        <StatusCard icon={Brain} label="Diagnóstico" value="—" hint="Disponível após a primeira análise" />
      </div>
    </div>
  );
}

function StatusCard({ icon: Icon, label, value, hint }: {
  icon: typeof Search;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-content-secondary mb-2">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-content-primary">{value}</p>
      <p className="text-xs text-content-muted mt-1">{hint}</p>
    </div>
  );
}

/* -------------------------------------------------------- Daily training */
function DailyTraining({ metrics }: { metrics: NonNullable<ReturnType<typeof useDashboardData>['metrics']> }) {
  const { dailyTraining } = metrics;

  if (!dailyTraining.hasMaterial) {
    return (
      <div className="card-raised p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="chip mb-2">
              <Clock className="h-3 w-3" />
              Treino do dia
            </div>
            <h2 className="text-lg font-bold text-content-primary">
              {metrics.analyzedGames > 0 ? 'Sem exercícios salvos ainda' : 'Sem diagnóstico disponível ainda'}
            </h2>
            <p className="text-sm text-content-secondary mt-1">
              {dailyTraining.reason}
            </p>
          </div>
          <div className="hidden sm:block h-12 w-12 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
            <Dumbbell className="h-6 w-6 text-brand-300" />
          </div>
        </div>
        <Link to="/app/analises" className="block mt-5">
          <Button variant="primary" className="w-full" icon={<Plus className="h-4 w-4" />}>
            {metrics.analyzedGames > 0 ? 'Gerar exercícios das análises' : 'Importar e analisar partidas'}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="card-raised p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="chip mb-2">
            <Clock className="h-3 w-3" />
            Treino do dia
          </div>
          <h2 className="text-lg font-bold text-content-primary">
            {dailyTraining.theme}
          </h2>
          <p className="text-sm text-content-secondary mt-1">
            {dailyTraining.reason}
          </p>
          {dailyTraining.exercisesAvailable > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <span className="chip text-brand-200">
                {dailyTraining.exercisesAvailable} exercício(s)
              </span>
            </div>
          )}
        </div>
        <div className="hidden sm:block h-12 w-12 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
          <Dumbbell className="h-6 w-6 text-brand-300" />
        </div>
      </div>
      <Link to="/app/treinar" className="block mt-5">
        <Button variant="primary" className="w-full" icon={<ArrowRight className="h-4 w-4" />}>
          Continuar treinamento
        </Button>
      </Link>
    </div>
  );
}

/* -------------------------------------------------------- Skills focus */
function SkillsFocus({ skills }: { skills: SkillIndicator[] }) {
  const skillsWithDesc: { skill: SkillIndicator; desc: string }[] = [
    { skill: skills.find((s) => s.category === 'tatica')!, desc: 'Combinações e cálculo de lances forçados.' },
    { skill: skills.find((s) => s.category === 'calculo')!, desc: 'Capacidade de avaliar variantes profundas.' },
    { skill: skills.find((s) => s.category === 'estrategia')!, desc: 'Planos posicionais e manejo de estrutura.' },
    { skill: skills.find((s) => s.category === 'finais')!, desc: 'Técnicas e conhecimento de finais.' },
    { skill: skills.find((s) => s.category === 'abertura')!, desc: 'Repertório e compreensão das posições.' },
  ];

  return (
    <div className="card p-6">
      <h2 className="text-base font-bold text-content-primary flex items-center gap-2">
        <Target className="h-4.5 w-4.5 text-brand-300" />
        Seu jogo em foco
      </h2>
      <p className="text-xs text-content-secondary mt-1">
        Indicadores de habilidade baseados nas partidas analisadas. Sem notas
        inventadas — cada indicador mostra a origem dos dados.
      </p>
      <div className="mt-5 space-y-3">
        {skillsWithDesc.map(({ skill, desc }) => (
          <SkillBar key={skill.category} skill={skill} desc={desc} />
        ))}
      </div>
    </div>
  );
}

function SkillBar({ skill, desc }: { skill: SkillIndicator; desc: string }) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-ink-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-content-primary">{skill.label}</p>
        <p className="text-xs text-content-secondary">{desc}</p>
      </div>
      <div className="text-right shrink-0">
        {skill.value !== null ? (
          <div className="flex items-center gap-2 justify-end">
            <div className="w-16 h-1.5 rounded-full bg-ink-border overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${skill.value}%`,
                  backgroundColor: skill.value >= 70 ? 'var(--color-success-500)' : skill.value >= 50 ? 'var(--color-warning-400)' : 'var(--color-danger-500)',
                }}
              />
            </div>
            <span className="text-sm font-bold text-content-primary">{skill.value}</span>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-0.5">
            <span className="chip text-content-muted">Sem dados</span>
            <span className="text-[10px] text-content-muted max-w-[140px] text-right">{skill.reason}</span>
          </div>
        )}
        {skill.value !== null && (
          <p className="text-[10px] text-content-muted mt-0.5">{skill.reason}</p>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Attention point */
function AttentionPoint({ metrics }: { metrics: NonNullable<ReturnType<typeof useDashboardData>['metrics']> }) {
  const { attention } = metrics;

  if (!attention) {
    return (
      <div className="card p-6">
        <h2 className="text-base font-bold text-content-primary flex items-center gap-2">
          <Lightbulb className="h-4.5 w-4.5 text-warning-300" />
          Seu ponto de atenção
        </h2>
        <div className="mt-4 rounded-xl bg-ink-raised border border-ink-border p-5">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-warning-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-4.5 w-4.5 text-warning-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-content-primary">
                {metrics.analyzedGames > 0 ? 'Dados insuficientes' : 'Análise pendente'}
              </p>
              <p className="text-xs text-content-secondary mt-1 leading-relaxed">
                {metrics.analyzedGames > 0
                  ? 'Suas partidas foram analisadas, mas ainda não há erros classificados suficientes para identificar uma fraqueza prioritária. Continue analisando partidas para que o padrão se torne claro.'
                  : 'Sem partidas analisadas ainda, não há como identificar sua fraqueza prioritária. Importe suas partidas para o diagnóstico apontar o que mais limita seu jogo.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="text-base font-bold text-content-primary flex items-center gap-2">
        <Lightbulb className="h-4.5 w-4.5 text-warning-300" />
        Seu ponto de atenção
      </h2>
      <div className="mt-4 rounded-xl bg-ink-raised border border-ink-border p-5">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 rounded-lg bg-warning-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-4.5 w-4.5 text-warning-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-content-primary">
              {attention.label}
            </p>
            <p className="text-xs text-content-secondary mt-1 leading-relaxed">
              {attention.evidence}
            </p>
            <p className="text-xs text-content-secondary mt-2 leading-relaxed">
              {attention.recommendation}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <span className="chip text-warning-300">
                {attention.occurrences} ocorrência(s)
              </span>
              <span className="chip text-content-muted">
                {attention.gamesUsed} partida(s)
              </span>
            </div>
          </div>
        </div>
        {metrics.dailyTraining.hasMaterial && (
          <Link to="/app/treinar" className="block mt-4">
            <Button variant="secondary" className="w-full" icon={<ArrowRight className="h-4 w-4" />}>
              Treinar esta habilidade
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Recent evolution */
function RecentEvolution({ metrics }: { metrics: NonNullable<ReturnType<typeof useDashboardData>['metrics']> }) {
  const { evolution } = metrics;

  if (!evolution.canCompare && evolution.totalAttempts === 0 && evolution.analyzedGames === 0) {
    return (
      <div className="card p-6">
        <h2 className="text-base font-bold text-content-primary flex items-center gap-2">
          <TrendingUp className="h-4.5 w-4.5 text-cyan-400" />
          Evolução recente
        </h2>
        <p className="text-xs text-content-secondary mt-1">
          Métricas comparáveis ao longo do tempo. A melhora em exercícios não
          garante aumento de rating automaticamente.
        </p>
        <div className="mt-5 flex items-center justify-center py-8 rounded-xl bg-ink-raised border border-ink-border">
          <div className="text-center">
            <BarChart3 className="h-8 w-8 text-content-muted mx-auto mb-2" />
            <p className="text-sm text-content-secondary">
              Sem dados suficientes para exibir evolução.
            </p>
            <p className="text-xs text-content-muted mt-1">
              Analise pelo menos {5} partidas ou resolva exercícios para começar.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="text-base font-bold text-content-primary flex items-center gap-2">
        <TrendingUp className="h-4.5 w-4.5 text-cyan-400" />
        Evolução recente
      </h2>
      <p className="text-xs text-content-secondary mt-1">
        Métricas comparáveis ao longo do tempo. A melhora em exercícios não
        garante aumento de rating automaticamente.
      </p>

      <div className="mt-5 grid sm:grid-cols-2 gap-4">
        {/* Exercícios */}
        <div className="rounded-xl bg-ink-raised border border-ink-border p-4">
          <p className="text-xs font-semibold text-content-secondary mb-2">Exercícios resolvidos</p>
          {evolution.totalAttempts > 0 ? (
            <>
              <div className="flex items-center gap-3">
                <p className="text-2xl font-bold text-content-primary">
                  {evolution.correctAttempts}/{evolution.totalAttempts}
                </p>
                {evolution.accuracy !== null && (
                  <span className="text-sm text-content-muted">
                    {evolution.accuracy.toFixed(0)}% de acerto
                  </span>
                )}
              </div>
              {evolution.canCompare && evolution.olderAccuracy !== null && evolution.recentAccuracy !== null ? (
                <TrendIndicator trend={evolution.accuracyTrend} older={evolution.olderAccuracy} recent={evolution.recentAccuracy} unit="%" />
              ) : (
                <p className="text-xs text-content-muted mt-2">
                  {evolution.totalAttempts < 5
                    ? `${evolution.totalAttempts} tentativa(s) — poucas para comparar períodos.`
                    : 'Dados insuficientes para comparar períodos.'}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-content-muted py-2">
              Nenhum exercício resolvido ainda.
            </p>
          )}
        </div>

        {/* Taxa de erro */}
        <div className="rounded-xl bg-ink-raised border border-ink-border p-4">
          <p className="text-xs font-semibold text-content-secondary mb-2">Taxa de erro nas partidas</p>
          {evolution.canCompare && evolution.olderErrorRate !== null && evolution.recentErrorRate !== null ? (
            <>
              <div className="flex items-center gap-3">
                <p className="text-2xl font-bold text-content-primary">
                  {evolution.recentErrorRate.toFixed(1)}%
                </p>
                <span className="text-sm text-content-muted">atual</span>
              </div>
              <TrendIndicator trend={evolution.errorTrend} older={evolution.olderErrorRate} recent={evolution.recentErrorRate} unit="%" invert />
            </>
          ) : (
            <p className="text-xs text-content-muted py-2">
              {evolution.analyzedGames < 5
                ? `${evolution.analyzedGames} partida(s) analisada(s) — mínimas de 5 para comparar.`
                : 'Dados insuficientes para comparar períodos.'}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2">
        <Info className="h-3.5 w-3.5 text-content-muted shrink-0 mt-0.5" />
        <p className="text-[10px] text-content-muted leading-relaxed">
          A melhora em exercícios é diferente da melhora em partidas. Os dois indicadores
          usam dados reais e datados — nenhum ponto histórico é inventado.
        </p>
      </div>
    </div>
  );
}

function TrendIndicator({
  trend,
  older,
  recent,
  unit,
  invert,
}: {
  trend: 'melhorando' | 'piorando' | 'estavel' | 'insuficiente';
  older: number;
  recent: number;
  unit: string;
  invert?: boolean;
}) {
  if (trend === 'insuficiente') {
    return <p className="text-xs text-content-muted mt-2">Dados insuficientes.</p>;
  }

  const diff = (recent - older).toFixed(1);
  const isImproving = invert ? trend === 'piorando' : trend === 'melhorando';
  const isWorsening = invert ? trend === 'melhorando' : trend === 'piorando';

  if (isImproving) {
    return (
      <div className="flex items-center gap-1.5 mt-2">
        <TrendingUp className="h-3.5 w-3.5 text-success-400" />
        <span className="text-xs text-success-400">
          Melhora de {Math.abs(parseFloat(diff))}{unit}
        </span>
      </div>
    );
  }
  if (isWorsening) {
    return (
      <div className="flex items-center gap-1.5 mt-2">
        <TrendingDown className="h-3.5 w-3.5 text-danger-400" />
        <span className="text-xs text-danger-400">
          Piora de {Math.abs(parseFloat(diff))}{unit}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 mt-2">
      <span className="text-xs text-content-secondary">Estável ({older.toFixed(1)}{unit} → {recent.toFixed(1)}{unit})</span>
    </div>
  );
}

/* ------------------------------------------------------------- Shortcuts */
function Shortcuts() {
  const shortcuts = [
    { to: '/app/analises', label: 'Analisar partidas', icon: Search },
    { to: '/app/treinar', label: 'Continuar treinamento', icon: Dumbbell },
    { to: '/app/evolucao', label: 'Ver relatório', icon: BarChart3 },
    { to: '/app/repertorio', label: 'Revisar aberturas', icon: BookOpen },
    { to: '/app/evolucao', label: 'Consultar evolução', icon: TrendingUp },
  ];
  return (
    <section>
      <h2 className="text-base font-bold text-content-primary mb-3">Atalhos</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {shortcuts.map((s) => (
          <Link key={s.label} to={s.to}>
            <div className="card p-4 flex items-center gap-3 hover:border-brand-500/40 transition-colors group">
              <div className="h-9 w-9 rounded-lg bg-brand-500/10 flex items-center justify-center group-hover:bg-brand-500/20 transition-colors">
                <s.icon className="h-4.5 w-4.5 text-brand-300" />
              </div>
              <span className="text-sm font-medium text-content-primary flex-1">{s.label}</span>
              <ArrowRight className="h-4 w-4 text-content-muted group-hover:text-brand-300 transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
