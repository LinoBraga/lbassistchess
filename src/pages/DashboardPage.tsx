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
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { LoadingState, EmptyState, Skeleton } from '@/components/ui/States';
import { Button } from '@/components/ui/Button';

export function DashboardPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [accountsCount, setAccountsCount] = useState(0);
  const [gamesCount, setGamesCount] = useState(0);
  const [analysesCount, setAnalysesCount] = useState(0);
  const [hasPrefs, setHasPrefs] = useState(false);

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

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Greeting */}
      <section>
        <h1 className="text-2xl sm:text-3xl font-bold text-content-primary">
          Seu próximo nível começa aqui.
        </h1>
        <p className="mt-1.5 text-sm sm:text-base text-content-secondary">
          Vamos trabalhar na habilidade que mais pode ajudar seu jogo hoje.
        </p>
      </section>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-40" />
          <div className="grid sm:grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      ) : !hasData ? (
        <EmptyDashboard
          firstName={firstName}
          accountsCount={accountsCount}
          gamesCount={gamesCount}
          hasPrefs={hasPrefs}
        />
      ) : (
        <div className="space-y-6">
          <DailyTraining />
          <div className="grid lg:grid-cols-2 gap-5">
            <SkillsFocus />
            <AttentionPoint />
          </div>
          <RecentEvolution />
          <Shortcuts />
        </div>
      )}
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

      {/* Quick status cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <StatusCard
          icon={Download}
          label="Partidas importadas"
          value={String(gamesCount)}
          hint={gamesCount === 0 ? 'Importe um arquivo PGN' : 'Pronto para análise'}
        />
        <StatusCard
          icon={Search}
          label="Contas conectadas"
          value={String(accountsCount)}
          hint={accountsCount === 0 ? 'Chess.com ou Lichess' : 'Pronto para importar'}
        />
        <StatusCard
          icon={Brain}
          label="Diagnóstico"
          value="—"
          hint="Disponível após a primeira análise"
        />
      </div>

      <Shortcuts />
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
function DailyTraining() {
  return (
    <div className="card-raised p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="chip mb-2">
            <Clock className="h-3 w-3" />
            Treino do dia
          </div>
          <h2 className="text-lg font-bold text-content-primary">
            Sem diagnóstico disponível ainda
          </h2>
          <p className="text-sm text-content-secondary mt-1">
            Importe e analise partidas para gerar seu treino personalizado.
          </p>
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
function SkillsFocus() {
  const skills = [
    { name: 'Tática', value: null, desc: 'Combinações e cálculo de lances forçados.' },
    { name: 'Cálculo', value: null, desc: 'Capacidade de avaliar variantes profundas.' },
    { name: 'Estratégia', value: null, desc: 'Planos posicionais e manejo de estrutura.' },
    { name: 'Finais', value: null, desc: 'Técnicas e conhecimento de finais.' },
    { name: 'Aberturas', value: null, desc: 'Repertório e compreensão das posições.' },
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
        {skills.map((s) => (
          <SkillBar key={s.name} name={s.name} desc={s.desc} />
        ))}
      </div>
    </div>
  );
}

function SkillBar({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex items-center gap-4 py-2 border-b border-ink-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-content-primary">{name}</p>
        <p className="text-xs text-content-secondary">{desc}</p>
      </div>
      <div className="text-right shrink-0">
        <span className="chip text-content-muted">Sem dados</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Attention point */
function AttentionPoint() {
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
              Análise pendente
            </p>
            <p className="text-xs text-content-secondary mt-1 leading-relaxed">
              Sem partidas analisadas ainda, não há como identificar sua fraqueza
              prioritária. Importe suas partidas para o diagnóstico apontar o que
              mais limita seu jogo.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- Recent evolution */
function RecentEvolution() {
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
        </div>
      </div>
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
