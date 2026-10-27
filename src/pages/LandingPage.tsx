import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Menu,
  X,
  ChevronRight,
  Target,
  Brain,
  Zap,
  BookOpen,
  TrendingUp,
  Search,
  Download,
  Lightbulb,
  Dumbbell,
  BarChart3,
  Check,
  ChevronDown,
  Crown,
  Swords,
  ClipboardList,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { useAppConfig, type Plan } from '@/hooks/useAppConfig';
import { useAuth } from '@/context/AuthContext';

const HERO_IMG =
  'https://images.pexels.com/photos/26093858/pexels-photo-26093858.jpeg?auto=compress&cs=tinysrgb&h=650&w=940';

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { plans, loading: configLoading } = useAppConfig();
  const { session } = useAuth();

  return (
    <div className="min-h-screen bg-ink overflow-x-hidden">
      <Header
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        session={!!session}
      />
      <main>
        <Hero />
        <Patterns />
        <Steps />
        <Features />
        <Pricing plans={plans} loading={configLoading} />
        <FAQ />
      </main>
      <Footer />
    </div>
  );
}

/* ----------------------------------------------------------------- Header */
function Header({
  mobileMenuOpen,
  setMobileMenuOpen,
  session,
}: {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
  session: boolean;
}) {
  const navLinks = [
    { href: '#funcionalidades', label: 'Funcionalidades' },
    { href: '#como-funciona', label: 'Como funciona' },
    { href: '#precos', label: 'Preços' },
    { href: '#faq', label: 'Perguntas frequentes' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-ink-border bg-ink/80 backdrop-blur-lg">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between">
          <Logo />

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="px-3 py-2 text-sm font-medium text-content-secondary hover:text-content-primary transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {session ? (
              <Link to="/app">
                <Button variant="primary" icon={<ChevronRight className="h-4 w-4" />}>
                  Ir para o painel
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost">Entrar</Button>
                </Link>
                <Link to="/cadastro">
                  <Button variant="primary">Começar</Button>
                </Link>
              </>
            )}
          </div>

          <button
            className="md:hidden rounded-lg p-2 text-content-secondary hover:bg-ink-raised"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden border-t border-ink-border bg-ink animate-fade-in">
          <div className="px-4 py-4 flex flex-col gap-1">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileMenuOpen(false)}
                className="px-3 py-2.5 text-sm font-medium text-content-secondary hover:text-content-primary rounded-lg hover:bg-ink-raised transition-colors"
              >
                {l.label}
              </a>
            ))}
            <div className="flex flex-col gap-2 pt-3 mt-2 border-t border-ink-border">
              <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="secondary" className="w-full">Entrar</Button>
              </Link>
              <Link to="/cadastro" onClick={() => setMobileMenuOpen(false)}>
                <Button variant="primary" className="w-full">Começar</Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------- Hero */
function Hero() {
  return (
    <section className="relative gradient-hero overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="animate-fade-in">
            <div className="chip mb-5 w-fit">
              <span className="h-1.5 w-1.5 rounded-full bg-success-400" />
              Análise com Stockfish · Treino personalizado
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight tracking-tight text-content-primary">
              Pare de treinar no escuro.{' '}
              <span className="text-gradient">
                Descubra o que está impedindo sua evolução.
              </span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-content-secondary leading-relaxed max-w-lg">
              Analise suas partidas, encontre padrões nos seus erros e receba um
              plano de treinamento feito para o seu jogo.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link to="/cadastro">
                <Button
                  variant="primary"
                  className="w-full sm:w-auto px-7 py-3.5 text-base"
                  icon={<Target className="h-5 w-5" />}
                >
                  Descobrir minhas fraquezas
                </Button>
              </Link>
              <a href="#como-funciona">
                <Button
                  variant="secondary"
                  className="w-full sm:w-auto px-7 py-3.5 text-base"
                >
                  Como funciona
                </Button>
              </a>
            </div>
          </div>

          <div className="relative animate-scale-in hidden sm:block">
            <div className="relative rounded-2xl overflow-hidden border border-ink-border shadow-raised">
              <img
                src={HERO_IMG}
                alt="Tabuleiro de xadrez em iluminação dramática"
                className="w-full h-[400px] object-cover"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-transparent" />
              <div className="absolute bottom-4 left-4 right-4">
                <div className="card-raised px-4 py-3 flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg gradient-brand flex items-center justify-center shrink-0">
                    <Brain className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-content-primary">
                      Diagnóstico personalizado
                    </p>
                    <p className="text-xs text-content-secondary truncate">
                      Baseado nas suas partidas analisadas
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- Patterns */
function Patterns() {
  return (
    <section className="py-20 sm:py-24 border-t border-ink-border">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center">
        <h2 className="text-2xl sm:text-3xl font-bold text-content-primary">
          Seu jogo tem padrões
        </h2>
        <p className="mt-4 text-base sm:text-lg text-content-secondary leading-relaxed">
          Uma partida isolada não conta toda a história. A plataforma procura
          padrões no seu histórico e mostra onde você precisa concentrar seus
          esforços — em vez de focar no erro de uma única partida.
        </p>
        <div className="mt-10 grid sm:grid-cols-3 gap-4">
          {[
            { icon: Search, label: 'Identifica padrões recorrentes', desc: 'Não basta ver um erro — procure o que se repete.' },
            { icon: Target, label: 'Prioriza o que mais limita', desc: 'Foco no impacto real sobre o seu desempenho.' },
            { icon: TrendingUp, label: 'Acompanha sua evolução', desc: 'Veja se você está corrigindo as fraquezas.' },
          ].map((item) => (
            <div key={item.label} className="card p-5 text-left">
              <div className="h-10 w-10 rounded-xl bg-brand-500/10 flex items-center justify-center mb-3">
                <item.icon className="h-5 w-5 text-brand-300" />
              </div>
              <h3 className="text-sm font-semibold text-content-primary">{item.label}</h3>
              <p className="text-xs text-content-secondary mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Steps */
function Steps() {
  const steps = [
    { icon: Download, title: 'Importe suas partidas', desc: 'Chess.com, Lichess ou arquivo PGN. O histórico é só seu.' },
    { icon: Search, title: 'Descubra suas dificuldades', desc: 'A engine encontra padrões. O diagnóstico separa o que importa.' },
    { icon: Dumbbell, title: 'Treine com exercícios personalizados', desc: 'Posições das suas partidas e exercícios adaptativos.' },
    { icon: TrendingUp, title: 'Acompanhe sua evolução', desc: 'Reavaliações mostram se o aprendizado está acontecendo.' },
  ];

  return (
    <section id="como-funciona" className="py-20 sm:py-24 border-t border-ink-border">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-content-primary">
            Do erro à evolução
          </h2>
          <p className="mt-3 text-base text-content-secondary">
            Quatro etapas entre importar uma partida e corrigir uma fraqueza real.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s, i) => (
            <div key={s.title} className="relative">
              <div className="card p-6 h-full">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl gradient-brand flex items-center justify-center shrink-0">
                    <s.icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-3xl font-bold text-ink-border">
                    {i + 1}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-content-primary">{s.title}</h3>
                <p className="text-xs text-content-secondary mt-1.5 leading-relaxed">{s.desc}</p>
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="hidden lg:block absolute top-1/2 -right-3 -translate-y-1/2 h-5 w-5 text-ink-border" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Features */
function Features() {
  const features = [
    { icon: Search, title: 'Análise de partidas', desc: 'Stockfish avalia cada lance, encontra erros, imprecisões e oportunidades táticas perdidas. Variantes e explicações em linguagem simples.' },
    { icon: ClipboardList, title: 'Diagnóstico personalizado', desc: 'Agrega várias partidas e identifica padrões recorrentes. Não conclusões de uma partida isolada — tendências reais.' },
    { icon: Dumbbell, title: 'Exercícios adaptativos', desc: 'Posições das suas partidas viram treino. Dificuldade ajusta ao desempenho, com repetição espaçada para retenção.' },
    { icon: BookOpen, title: 'Preparação de aberturas', desc: 'Veja suas aberturas mais jogadas, resultados por abertura, posições críticas recorrentes e o que vale revisar.' },
    { icon: BarChart3, title: 'Relatórios de evolução', desc: 'Métricas comparáveis ao longo do tempo. Sem inventar ratings ou prometer aumentos garantidos.' },
    { icon: Zap, title: 'Plano semanal de estudo', desc: 'Sessões de 15 a 30 minutos com objetivos claros, baseadas nas suas fraquezas e revisões pendentes.' },
  ];

  return (
    <section id="funcionalidades" className="py-20 sm:py-24 border-t border-ink-border">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-content-primary">
            Recursos que transformam análise em aprendizagem
          </h2>
          <p className="mt-3 text-base text-content-secondary max-w-xl mx-auto">
            O diferencial não é só mostrar números — é transformar análise em
            treino mensurável.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="card p-6 hover:border-brand-500/40 transition-colors group"
            >
              <div className="h-11 w-11 rounded-xl bg-brand-500/10 flex items-center justify-center mb-4 group-hover:bg-brand-500/20 transition-colors">
                <f.icon className="h-5 w-5 text-brand-300" />
              </div>
              <h3 className="text-base font-semibold text-content-primary">{f.title}</h3>
              <p className="text-sm text-content-secondary mt-2 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Pricing */
function Pricing({ plans, loading }: { plans: Plan[]; loading: boolean }) {
  return (
    <section id="precos" className="py-20 sm:py-24 border-t border-ink-border">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-content-primary">
            Preço simples, valor claro
          </h2>
          <p className="mt-3 text-base text-content-secondary">
            Comece com o plano Pro. Cancele quando quiser.
          </p>
        </div>

        {loading ? (
          <div className="max-w-md mx-auto skeleton h-[480px] rounded-2xl" />
        ) : plans.length === 0 ? (
          <div className="card p-8 text-center max-w-md mx-auto">
            <p className="text-sm text-content-secondary">
              Os valores estão sendo configurados. Em breve disponível.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-1 max-w-md mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="card-raised p-8 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 h-32 w-32 gradient-soft rounded-full -translate-y-1/2 translate-x-1/2 opacity-60" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-1">
                    <Crown className="h-5 w-5 text-brand-300" />
                    <h3 className="text-lg font-bold text-content-primary">{plan.name}</h3>
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-content-primary">
                      R$ {plan.price_monthly.toFixed(2).replace('.', ',')}
                    </span>
                    <span className="text-sm text-content-secondary">/mês</span>
                  </div>
                  <p className="text-xs text-content-muted mt-1">
                    Cobrança mensal recorrente. Cancele quando quiser.
                  </p>

                  <ul className="mt-6 space-y-3">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <div className="h-5 w-5 rounded-full bg-success-500/10 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="h-3 w-3 text-success-400" />
                        </div>
                        <span className="text-sm text-content-secondary">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Link to="/cadastro" className="block mt-8">
                    <Button variant="primary" className="w-full" icon={<Swords className="h-4 w-4" />}>
                      Começar agora
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- FAQ */
function FAQ() {
  const faqs = [
    {
      q: 'Como importo minhas partidas?',
      a: 'Você pode conectar sua conta do Chess.com ou Lichess pelo nome de usuário público (sem senha) e selecionar o período a importar. Também é possível carregar arquivos PGN diretamente pelo navegador. A plataforma valida os arquivos e ignora duplicatas.',
    },
    {
      q: 'Como funciona a análise?',
      a: 'As partidas são processadas por um serviço backend com o Stockfish. A engine avalia cada lance, identifica erros, imprecisões e oportunidades táticas, e gera variantes. Os resultados são armazenados para evitar recomputar análises idênticas. Não inventamos resultados de engine — toda avaliação vem do processamento real.',
    },
    {
      q: 'O que é necessário para treinar?',
      a: 'Após importar e analisar partidas, o diagnóstico identifica suas fraquezas prioritárias. O treinamento converte posições críticas das suas partidas em exercícios e adiciona posições semelhantes para verificar se o conceito foi aprendido. A repetição espaçada agenda revisões dos erros anteriores.',
    },
    {
      q: 'Quais são as limitações?',
      a: 'O número de análises mensais e exercícios diários é limitado pelo plano para equilibrar custo e qualidade. Análises pesadas não rodam em funções serverless curtas — usamos um serviço de processamento próprio. Conclusões fortes exigem um número mínimo de partidas; com poucos dados, apresentamos hipóteses com grau de confiança adequado.',
    },
    {
      q: 'Como funcionam as assinaturas?',
      a: 'A assinatura é mensal e recorrente. O valor e os limites são definidos pelo backend, não pelo navegador. O status da assinatura só muda após confirmação verificada do pagamento. Você pode cancelar a qualquer momento. Se as credenciais do provedor ainda não estiverem configuradas, a estrutura de integração fica pronta e o estado aparece como pendente.',
    },
  ];

  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 sm:py-24 border-t border-ink-border">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-content-primary">
            Perguntas frequentes
          </h2>
        </div>
        <div className="space-y-3">
          {faqs.map((item, i) => (
            <div key={i} className="card overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-sm font-semibold text-content-primary">{item.q}</span>
                <ChevronDown
                  className={`h-4 w-4 text-content-secondary shrink-0 transition-transform ${
                    open === i ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {open === i && (
                <div className="px-5 pb-4 animate-fade-in">
                  <p className="text-sm text-content-secondary leading-relaxed">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Footer */
function Footer() {
  return (
    <footer className="border-t border-ink-border py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo size="sm" />
          <div className="flex items-center gap-5 text-xs text-content-secondary">
            <Link to="/privacidade" className="hover:text-content-primary transition-colors">
              Privacidade
            </Link>
            <Link to="/termos" className="hover:text-content-primary transition-colors">
              Termos de uso
            </Link>
            <span>© {new Date().getFullYear()} LB Assist Chess</span>
          </div>
        </div>
        <p className="mt-6 text-xs text-content-muted text-center max-w-2xl mx-auto leading-relaxed">
          LB Assist Chess é um produto independente de análise e treinamento de
          xadrez. Não promete aumentos garantidos de rating. Os resultados das
          análises são gerados por engine (Stockfish) e não são inventados.
        </p>
      </div>
    </footer>
  );
}
