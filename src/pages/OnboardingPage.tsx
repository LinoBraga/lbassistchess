import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gauge,
  Monitor,
  Clock,
  CalendarClock,
  Target,
  Sparkles,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

type Platform = 'chesscom' | 'lichess' | 'ambas';
type Objective = 'rapidas' | 'blitz' | 'classicas' | 'geral';

export function OnboardingPage() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [rating, setRating] = useState<string>('');
  const [platform, setPlatform] = useState<Platform | ''>('');
  const [timeControl, setTimeControl] = useState<string>('');
  const [minutesPerDay, setMinutesPerDay] = useState<string>('');
  const [objective, setObjective] = useState<Objective | ''>('');

  const totalSteps = 5;

  const canAdvance = () => {
    switch (step) {
      case 0: return rating !== '' || true; // opcional
      case 1: return platform !== '';
      case 2: return timeControl !== '';
      case 3: return minutesPerDay !== '';
      case 4: return objective !== '';
      default: return true;
    }
  };

  const next = () => {
    if (step < totalSteps - 1) setStep(step + 1);
    else finish();
  };

  const back = () => {
    if (step === 0) navigate('/app');
    else setStep(step - 1);
  };

  const finish = async () => {
    if (!profile?.id) {
      navigate('/app');
      return;
    }
    setSaving(true);
    const ratingNum = rating ? parseInt(rating, 10) : null;

    const { error: prefError } = await supabase.from('training_preferences').upsert({
      user_id: profile.id,
      platform: platform || null,
      time_control: timeControl || null,
      minutes_per_day: minutesPerDay ? parseInt(minutesPerDay, 10) : null,
      objective: objective || null,
      rating_approx: ratingNum,
    });

    const { error: profError } = await supabase.from('profiles').update({
      onboarding_completed: true,
      declared_rating: ratingNum,
      rating_source: ratingNum ? 'declarado' : null,
      rating_recorded_at: ratingNum ? new Date().toISOString() : null,
    }).eq('id', profile.id);

    setSaving(false);

    if (prefError || profError) {
      toast('error', 'Não foi possível salvar suas preferências. Tente novamente.');
      return;
    }
    await refreshProfile();
    toast('success', 'Tudo pronto! Seu painel está pronto.');
    navigate('/app', { replace: true });
  };

  const skip = () => {
    if (step < totalSteps - 1) setStep(step + 1);
    else finish();
  };

  const steps = [
    <StepRating key="0" value={rating} onChange={setRating} />,
    <StepPlatform key="1" value={platform} onChange={(v) => setPlatform(v as Platform)} />,
    <StepTimeControl key="2" value={timeControl} onChange={setTimeControl} />,
    <StepMinutes key="3" value={minutesPerDay} onChange={setMinutesPerDay} />,
    <StepObjective key="4" value={objective} onChange={(v) => setObjective(v as Objective)} />,
  ];

  return (
    <div className="min-h-screen flex flex-col bg-ink gradient-hero">
      <div className="px-4 sm:px-6 py-5 flex items-center justify-between">
        <Logo />
        <button onClick={() => navigate('/app')} className="text-xs text-content-secondary hover:text-content-primary">
          Pular por agora
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg animate-fade-in">
          {/* Progress */}
          <div className="flex items-center gap-1.5 mb-8">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                  i <= step ? 'bg-brand-500' : 'bg-ink-border'
                }`}
              />
            ))}
          </div>

          <div className="card-raised p-7">
            {steps[step]}

            <div className="mt-8 flex items-center justify-between gap-3">
              <Button variant="ghost" onClick={back} icon={<ArrowLeft className="h-4 w-4" />}>
                {step === 0 ? 'Pular' : 'Voltar'}
              </Button>
              <div className="flex items-center gap-2">
                {step < totalSteps - 1 && (
                  <button onClick={skip} className="text-xs text-content-secondary hover:text-content-primary px-3">
                    Pular
                  </button>
                )}
                <Button
                  onClick={next}
                  loading={saving}
                  disabled={!canAdvance()}
                  icon={<ArrowRight className="h-4 w-4" />}
                >
                  {step === totalSteps - 1 ? 'Concluir' : 'Continuar'}
                </Button>
              </div>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-content-muted">
            {step + 1} de {totalSteps} · Você pode alterar essas preferências depois
          </p>
        </div>
      </div>
    </div>
  );
}

function StepHeader({ icon: Icon, title, desc }: { icon: typeof Gauge; title: string; desc: string }) {
  return (
    <div>
      <div className="h-12 w-12 rounded-xl bg-brand-500/10 flex items-center justify-center mb-4">
        <Icon className="h-6 w-6 text-brand-300" />
      </div>
      <h2 className="text-xl font-bold text-content-primary">{title}</h2>
      <p className="mt-1.5 text-sm text-content-secondary">{desc}</p>
    </div>
  );
}

function OptionCard({ selected, onClick, icon: Icon, label, desc }: {
  selected: boolean;
  onClick: () => void;
  icon: typeof Gauge;
  label: string;
  desc?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-xl border transition-all ${
        selected
          ? 'bg-brand-500/10 border-brand-500/50'
          : 'bg-ink border-ink-border hover:border-brand-500/30'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
          selected ? 'bg-brand-500/20' : 'bg-ink-raised'
        }`}>
          <Icon className={`h-4.5 w-4.5 ${selected ? 'text-brand-300' : 'text-content-secondary'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-content-primary">{label}</p>
          {desc && <p className="text-xs text-content-secondary mt-0.5">{desc}</p>}
        </div>
        {selected && <Check className="h-5 w-5 text-brand-300 shrink-0" />}
      </div>
    </button>
  );
}

function StepRating({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeader
        icon={Gauge}
        title="Qual é o seu rating aproximado?"
        desc="Isso nos ajuda a calibrar o nível dos exercícios. É opcional e não usamos o rating declarado como medida exata da sua força."
      />
      <div className="mt-6">
        <input
          type="number"
          className="input"
          placeholder="Ex.: 1500"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={400}
          max={3500}
        />
        <p className="mt-2 text-xs text-content-muted">
          Se você não souber, pode pular — descobriremos a partir das suas partidas.
        </p>
      </div>
    </div>
  );
}

function StepPlatform({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <StepHeader
        icon={Monitor}
        title="Onde você joga?"
        desc="Conectaremos sua conta para importar partidas. Não pedimos senha — apenas o nome de usuário público."
      />
      <div className="mt-6 space-y-2.5">
        <OptionCard selected={value === 'chesscom'} onClick={() => onChange('chesscom')} icon={Target} label="Chess.com" />
        <OptionCard selected={value === 'lichess'} onClick={() => onChange('lichess')} icon={Target} label="Lichess" />
        <OptionCard selected={value === 'ambas'} onClick={() => onChange('ambas')} icon={Target} label="Ambas" desc="Uso as duas plataformas" />
      </div>
    </div>
  );
}

function StepTimeControl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { v: 'blitz', label: 'Blitz (3–5 min)' },
    { v: 'rapidas', label: 'Rápidas (10–15 min)' },
    { v: 'classicas', label: 'Clássicas (30+ min)' },
    { v: 'bullet', label: 'Bullet (1–2 min)' },
  ];
  return (
    <div>
      <StepHeader
        icon={Clock}
        title="Qual controle de tempo você joga mais?"
        desc="Priorizamos a análise das partidas mais relevantes para o seu jogo."
      />
      <div className="mt-6 space-y-2.5">
        {opts.map((o) => (
          <OptionCard key={o.v} selected={value === o.v} onClick={() => onChange(o.v)} icon={Clock} label={o.label} />
        ))}
      </div>
    </div>
  );
}

function StepMinutes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { v: '15', label: '15 minutos', desc: 'Sessão curta e focada' },
    { v: '30', label: '30 minutos', desc: 'Treino consistente' },
    { v: '60', label: '60 minutos', desc: 'Estudo aprofundado' },
  ];
  return (
    <div>
      <StepHeader
        icon={CalendarClock}
        title="Quanto tempo você pode estudar por dia?"
        desc="Montamos um plano semanal que cabe na sua rotina. Sessões de 15 a 30 minutos."
      />
      <div className="mt-6 space-y-2.5">
        {opts.map((o) => (
          <OptionCard key={o.v} selected={value === o.v} onClick={() => onChange(o.v)} icon={CalendarClock} label={o.label} desc={o.desc} />
        ))}
      </div>
    </div>
  );
}

function StepObjective({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { v: 'rapidas', label: 'Rápidas', desc: 'Melhorar em partidas rápidas' },
    { v: 'blitz', label: 'Blitz', desc: 'Melhorar em blitz' },
    { v: 'classicas', label: 'Clássicas', desc: 'Melhorar em partidas clássicas' },
    { v: 'geral', label: 'Xadrez em geral', desc: 'Evoluir de forma equilibrada' },
  ];
  return (
    <div>
      <StepHeader
        icon={Target}
        title="Qual é o seu objetivo principal?"
        desc="Direcionamos o diagnóstico e o treino para o que mais importa para você."
      />
      <div className="mt-6 space-y-2.5">
        {opts.map((o) => (
          <OptionCard key={o.v} selected={value === o.v} onClick={() => onChange(o.v)} icon={Sparkles} label={o.label} desc={o.desc} />
        ))}
      </div>
    </div>
  );
}
