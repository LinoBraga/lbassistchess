import { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Pencil,
  Check,
  Target,
  Clock,
  CalendarClock,
  Sparkles,
  Shield,
  KeyRound,
  LogOut,
  Search,
  Brain,
  Cpu,
  ChevronRight,
  Save,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { toast } from '@/components/ui/Toast';
import { useNavigate } from 'react-router-dom';

interface TrainingPrefs {
  platform: string | null;
  time_control: string | null;
  minutes_per_day: number | null;
  objective: string | null;
  rating_approx: number | null;
}

interface ExternalAccount {
  id: string;
  provider: 'chesscom' | 'lichess';
  external_username: string;
  connected_at: string;
  last_sync_at: string | null;
  status: string;
}

interface ActivityStats {
  gamesCount: number;
  analysesCount: number;
  accountsCount: number;
  diagnosesCount: number;
}

const PLATFORM_LABELS: Record<string, string> = {
  chesscom: 'Chess.com',
  lichess: 'Lichess',
  ambas: 'Chess.com e Lichess',
};

const TIME_CONTROL_LABELS: Record<string, string> = {
  blitz: 'Blitz (3–5 min)',
  rapidas: 'Rápidas (10–15 min)',
  classicas: 'Clássicas (30+ min)',
  bullet: 'Bullet (1–2 min)',
};

const OBJECTIVE_LABELS: Record<string, string> = {
  rapidas: 'Rápidas',
  blitz: 'Blitz',
  classica: 'Clássicas',
  geral: 'Xadrez em geral',
};

const MINUTES_OPTIONS = [
  { v: '15', label: '15 min' },
  { v: '30', label: '30 min' },
  { v: '60', label: '60 min' },
];

export function PerfilPage() {
  const { profile, session, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<TrainingPrefs | null>(null);
  const [accounts, setAccounts] = useState<ExternalAccount[]>([]);
  const [activity, setActivity] = useState<ActivityStats | null>(null);

  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editPrefsOpen, setEditPrefsOpen] = useState(false);
  const [editAccountsOpen, setEditAccountsOpen] = useState(false);

  const loadAll = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    setError(null);

    try {
      const [prefsRes, accountsRes, gamesRes, analysesRes, diagnosesRes, accountsCountRes] = await Promise.all([
        supabase.from('training_preferences').select('*').eq('user_id', profile.id).maybeSingle(),
        supabase.from('external_accounts').select('*').eq('user_id', profile.id).order('connected_at'),
        supabase.from('games').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
        supabase.from('game_analyses').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('status', 'concluida'),
        supabase.from('diagnoses').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
        supabase.from('external_accounts').select('id', { count: 'exact', head: true }).eq('user_id', profile.id),
      ]);

      setPrefs((prefsRes.data as unknown as TrainingPrefs | null) ?? null);
      setAccounts((accountsRes.data as unknown as ExternalAccount[]) ?? []);
      setActivity({
        gamesCount: gamesRes.count ?? 0,
        analysesCount: analysesRes.count ?? 0,
        accountsCount: accountsCountRes.count ?? 0,
        diagnosesCount: diagnosesRes.count ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleSignOut = async () => {
    await signOut();
    toast('info', 'Você saiu da sua conta.');
    navigate('/', { replace: true });
  };

  if (loading) return <LoadingState label="Carregando perfil…" />;
  if (error) return <ErrorState message={error} onRetry={loadAll} />;

  const email = profile?.email ?? session?.user?.email ?? null;
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      {/* === Header === */}
      <div className="card-raised p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <Avatar profile={profile} />
          <div className="flex-1 text-center sm:text-left min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-content-primary">
              {profile?.display_name || email?.split('@')[0] || 'Jogador'}
            </h1>
            {email && (
              <p className="text-sm text-content-secondary mt-1 flex items-center justify-center sm:justify-start gap-1.5">
                <Mail className="h-3.5 w-3.5 text-content-muted" />
                <span className="truncate">{email}</span>
              </p>
            )}
            <div className="flex items-center justify-center sm:justify-start gap-3 mt-2 flex-wrap">
              {profile?.declared_rating && (
                <span className="chip">
                  <Target className="h-3 w-3 text-brand-300" />
                  {profile.declared_rating} Elo
                </span>
              )}
              {memberSince && (
                <span className="chip">Membro desde {memberSince}</span>
              )}
            </div>
          </div>
          <Button
            variant="secondary"
            icon={<Pencil className="h-4 w-4" />}
            onClick={() => setEditNameOpen(true)}
            className="shrink-0"
          >
            Editar
          </Button>
        </div>
      </div>

      {/* === Activity indicators === */}
      {activity && (activity.gamesCount > 0 || activity.analysesCount > 0) && (
        <ActivitySection activity={activity} />
      )}

      {/* === Chess accounts === */}
      <Section
        icon={Target}
        title="Contas de xadrez"
        desc="Conecte seu username público do Chess.com e Lichess para importação de partidas."
      >
        {accounts.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-content-secondary">
              Nenhuma conta conectada ainda.
            </p>
            <Button
              variant="secondary"
              className="mt-3"
              icon={<ChevronRight className="h-4 w-4" />}
              onClick={() => setEditAccountsOpen(true)}
            >
              Conectar conta
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2.5">
              {accounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between gap-3 rounded-xl bg-ink-raised border border-ink-border p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                      <Target className="h-4.5 w-4.5 text-brand-300" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-content-primary truncate">
                        {acc.external_username}
                      </p>
                      <p className="text-xs text-content-muted">
                        {PLATFORM_LABELS[acc.provider] ?? acc.provider}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {acc.status === 'conectada' && (
                      <span className="chip text-success-400 text-[10px]">
                        <Check className="h-3 w-3" />
                        Conectada
                      </span>
                    )}
                    {acc.status === 'erro' && (
                      <span className="chip text-danger-400 text-[10px]">Erro</span>
                    )}
                    <button
                      onClick={() => setEditAccountsOpen(true)}
                      className="text-xs text-brand-300 hover:text-brand-200 font-medium"
                    >
                      Gerenciar
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              className="mt-3"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => setEditAccountsOpen(true)}
            >
              Gerenciar contas
            </Button>
          </>
        )}
      </Section>

      {/* === Training preferences === */}
      <Section
        icon={Sparkles}
        title="Preferências de treinamento"
        desc="Definidas no onboarding. Você pode atualizá-las a qualquer momento."
      >
        {prefs ? (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <PrefRow icon={Target} label="Plataforma" value={PLATFORM_LABELS[prefs.platform ?? ''] ?? 'Não definida'} />
              <PrefRow icon={Clock} label="Controle de tempo" value={TIME_CONTROL_LABELS[prefs.time_control ?? ''] ?? 'Não definido'} />
              <PrefRow icon={CalendarClock} label="Tempo por dia" value={prefs.minutes_per_day ? `${prefs.minutes_per_day} min` : 'Não definido'} />
              <PrefRow icon={Sparkles} label="Objetivo" value={OBJECTIVE_LABELS[prefs.objective ?? ''] ?? 'Não definido'} />
            </div>
            <Button
              variant="ghost"
              className="mt-3"
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => setEditPrefsOpen(true)}
            >
              Atualizar preferências
            </Button>
          </>
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm text-content-secondary">
              Você ainda não configurou suas preferências de treinamento.
            </p>
            <Button
              variant="secondary"
              className="mt-3"
              icon={<ChevronRight className="h-4 w-4" />}
              onClick={() => setEditPrefsOpen(true)}
            >
              Configurar agora
            </Button>
          </div>
        )}
      </Section>

      {/* === Security === */}
      <Section
        icon={Shield}
        title="Segurança da conta"
        desc="Gerencie sua senha e sessão."
      >
        <div className="space-y-2.5">
          <SecurityRow
            icon={KeyRound}
            label="Senha"
            desc="Redefinir via e-mail"
            actionLabel="Redefinir"
            onClick={() => {
              if (!email) return;
              supabase.auth.resetPasswordForEmail(email).then(({ error }) => {
                if (error) {
                  toast('error', 'Não foi possível enviar o link de redefinição.');
                } else {
                  toast('success', 'Link de redefinição enviado para seu e-mail.');
                }
              });
            }}
          />
          <SecurityRow
            icon={LogOut}
            label="Sair da conta"
            desc="Encerrar sessão neste dispositivo"
            actionLabel="Sair"
            danger
            onClick={handleSignOut}
          />
        </div>
      </Section>

      {/* === Modals === */}
      <EditNameModal
        open={editNameOpen}
        onClose={() => setEditNameOpen(false)}
        displayName={profile?.display_name ?? null}
        avatarUrl={profile?.avatar_url ?? null}
        onSaved={async () => {
          await refreshProfile();
          setEditNameOpen(false);
        }}
      />

      <EditPrefsModal
        open={editPrefsOpen}
        onClose={() => setEditPrefsOpen(false)}
        currentPrefs={prefs}
        onSaved={() => {
          loadAll();
          setEditPrefsOpen(false);
        }}
      />

      <EditAccountsModal
        open={editAccountsOpen}
        onClose={() => setEditAccountsOpen(false)}
        currentAccounts={accounts}
        onSaved={() => {
          loadAll();
          setEditAccountsOpen(false);
        }}
      />
    </div>
  );
}

// === Avatar ===

function Avatar({ profile }: { profile: ReturnType<typeof useAuth>['profile'] }) {
  const initial = (profile?.display_name || profile?.email || '?').charAt(0).toUpperCase();
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt="Avatar"
        className="h-20 w-20 rounded-2xl object-cover border border-ink-border shrink-0"
      />
    );
  }
  return (
    <div className="h-20 w-20 rounded-2xl gradient-brand flex items-center justify-center shrink-0">
      <span className="text-3xl font-bold text-white">{initial}</span>
    </div>
  );
}

// === Section wrapper ===

function Section({
  icon: Icon,
  title,
  desc,
  children,
}: {
  icon: typeof Target;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-9 w-9 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
          <Icon className="h-4.5 w-4.5 text-brand-300" />
        </div>
        <div>
          <h2 className="text-base font-bold text-content-primary">{title}</h2>
          <p className="text-xs text-content-secondary mt-0.5">{desc}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

// === Pref row ===

function PrefRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Target;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-ink-raised border border-ink-border p-3">
      <div className="flex items-center gap-1.5 text-content-muted mb-1">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-semibold text-content-primary">{value}</p>
    </div>
  );
}

// === Security row ===

function SecurityRow({
  icon: Icon,
  label,
  desc,
  actionLabel,
  onClick,
  danger,
}: {
  icon: typeof KeyRound;
  label: string;
  desc: string;
  actionLabel: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-ink-raised border border-ink-border p-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${danger ? 'bg-danger-500/10' : 'bg-brand-500/10'}`}>
          <Icon className={`h-4.5 w-4.5 ${danger ? 'text-danger-400' : 'text-brand-300'}`} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-content-primary">{label}</p>
          <p className="text-xs text-content-muted">{desc}</p>
        </div>
      </div>
      <button
        onClick={onClick}
        className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
          danger
            ? 'text-danger-400 hover:bg-danger-500/10'
            : 'text-brand-300 hover:text-brand-200'
        }`}
      >
        {actionLabel}
      </button>
    </div>
  );
}

// === Activity section ===

function ActivitySection({ activity }: { activity: ActivityStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <ActivityCard icon={Search} label="Partidas importadas" value={activity.gamesCount} color="text-brand-300" />
      <ActivityCard icon={Cpu} label="Análises concluídas" value={activity.analysesCount} color="text-success-400" />
      <ActivityCard icon={Brain} label="Diagnósticos" value={activity.diagnosesCount} color="text-cyan-400" />
      <ActivityCard icon={Target} label="Contas conectadas" value={activity.accountsCount} color="text-warning-300" />
    </div>
  );
}

function ActivityCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Search;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-content-muted mb-1.5">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

// === Edit name modal ===

function EditNameModal({
  open,
  onClose,
  displayName,
  avatarUrl,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  displayName: string | null;
  avatarUrl: string | null;
  onSaved: () => Promise<void>;
}) {
  const { profile } = useAuth();
  const [name, setName] = useState(displayName ?? '');
  const [avatar, setAvatar] = useState(avatarUrl ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(displayName ?? '');
    setAvatar(avatarUrl ?? '');
  }, [open, displayName, avatarUrl]);

  const save = async () => {
    if (!profile?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        display_name: name.trim() || null,
        avatar_url: avatar.trim() || null,
      })
      .eq('id', profile.id);

    setSaving(false);
    if (error) {
      toast('error', 'Não foi possível salvar. Tente novamente.');
      return;
    }
    toast('success', 'Perfil atualizado.');
    await onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title="Editar perfil" maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="display-name">Nome de exibição</label>
          <input
            id="display-name"
            className="input"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
        </div>
        <div>
          <label className="label" htmlFor="avatar-url">URL do avatar</label>
          <input
            id="avatar-url"
            className="input"
            placeholder="https://..."
            value={avatar}
            onChange={(e) => setAvatar(e.target.value)}
            type="url"
          />
          <p className="text-xs text-content-muted mt-1.5">
            Cole a URL de uma imagem. Deixe em branco para usar as iniciais.
          </p>
        </div>
        <Button variant="primary" onClick={save} loading={saving} className="w-full" icon={<Save className="h-4 w-4" />}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

// === Edit prefs modal ===

function EditPrefsModal({
  open,
  onClose,
  currentPrefs,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  currentPrefs: TrainingPrefs | null;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [platform, setPlatform] = useState(currentPrefs?.platform ?? '');
  const [timeControl, setTimeControl] = useState(currentPrefs?.time_control ?? '');
  const [minutesPerDay, setMinutesPerDay] = useState(currentPrefs?.minutes_per_day?.toString() ?? '');
  const [objective, setObjective] = useState(currentPrefs?.objective ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPlatform(currentPrefs?.platform ?? '');
    setTimeControl(currentPrefs?.time_control ?? '');
    setMinutesPerDay(currentPrefs?.minutes_per_day?.toString() ?? '');
    setObjective(currentPrefs?.objective ?? '');
  }, [open, currentPrefs]);

  const save = async () => {
    if (!profile?.id) return;
    setSaving(true);
    const { error } = await supabase.from('training_preferences').upsert({
      user_id: profile.id,
      platform: platform || null,
      time_control: timeControl || null,
      minutes_per_day: minutesPerDay ? parseInt(minutesPerDay, 10) : null,
      objective: objective || null,
      rating_approx: currentPrefs?.rating_approx ?? null,
    });
    setSaving(false);
    if (error) {
      toast('error', 'Não foi possível salvar as preferências.');
      return;
    }
    toast('success', 'Preferências atualizadas.');
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title="Preferências de treinamento" maxWidth="max-w-md">
      <div className="space-y-5">
        <div>
          <label className="label">Plataforma</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: 'chesscom', label: 'Chess.com' },
              { v: 'lichess', label: 'Lichess' },
              { v: 'ambas', label: 'Ambas' },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => setPlatform(o.v)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                  platform === o.v
                    ? 'bg-brand-500/10 border-brand-500/50 text-brand-200'
                    : 'bg-ink border-ink-border text-content-secondary hover:border-brand-500/30'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Controle de tempo</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TIME_CONTROL_LABELS).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setTimeControl(v)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                  timeControl === v
                    ? 'bg-brand-500/10 border-brand-500/50 text-brand-200'
                    : 'bg-ink border-ink-border text-content-secondary hover:border-brand-500/30'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Tempo por dia</label>
          <div className="grid grid-cols-3 gap-2">
            {MINUTES_OPTIONS.map((o) => (
              <button
                key={o.v}
                onClick={() => setMinutesPerDay(o.v)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                  minutesPerDay === o.v
                    ? 'bg-brand-500/10 border-brand-500/50 text-brand-200'
                    : 'bg-ink border-ink-border text-content-secondary hover:border-brand-500/30'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Objetivo</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: 'rapidas', label: 'Rápidas' },
              { v: 'blitz', label: 'Blitz' },
              { v: 'classicas', label: 'Clássicas' },
              { v: 'geral', label: 'Geral' },
            ].map((o) => (
              <button
                key={o.v}
                onClick={() => setObjective(o.v)}
                className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                  objective === o.v
                    ? 'bg-brand-500/10 border-brand-500/50 text-brand-200'
                    : 'bg-ink border-ink-border text-content-secondary hover:border-brand-500/30'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <Button variant="primary" onClick={save} loading={saving} className="w-full" icon={<Save className="h-4 w-4" />}>
          Salvar preferências
        </Button>
      </div>
    </Modal>
  );
}

// === Edit accounts modal ===

function EditAccountsModal({
  open,
  onClose,
  currentAccounts,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  currentAccounts: ExternalAccount[];
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<ExternalAccount[]>([]);
  const [chesscomUser, setChesscomUser] = useState('');
  const [lichessUser, setLichessUser] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAccounts(currentAccounts);
    const cc = currentAccounts.find((a) => a.provider === 'chesscom');
    const li = currentAccounts.find((a) => a.provider === 'lichess');
    setChesscomUser(cc?.external_username ?? '');
    setLichessUser(li?.external_username ?? '');
  }, [open, currentAccounts]);

  const save = async () => {
    if (!profile?.id) return;
    setSaving(true);

    try {
      const updates: Promise<unknown>[] = [];

      const existingChesscom = accounts.find((a) => a.provider === 'chesscom');
      if (chesscomUser.trim()) {
        if (existingChesscom) {
          updates.push(
            supabase
              .from('external_accounts')
              .update({ external_username: chesscomUser.trim() })
              .eq('id', existingChesscom.id),
          );
        } else {
          updates.push(
            supabase.from('external_accounts').insert({
              user_id: profile.id,
              provider: 'chesscom',
              external_username: chesscomUser.trim(),
              status: 'conectada',
            }),
          );
        }
      } else if (existingChesscom) {
        updates.push(supabase.from('external_accounts').delete().eq('id', existingChesscom.id));
      }

      const existingLichess = accounts.find((a) => a.provider === 'lichess');
      if (lichessUser.trim()) {
        if (existingLichess) {
          updates.push(
            supabase
              .from('external_accounts')
              .update({ external_username: lichessUser.trim() })
              .eq('id', existingLichess.id),
          );
        } else {
          updates.push(
            supabase.from('external_accounts').insert({
              user_id: profile.id,
              provider: 'lichess',
              external_username: lichessUser.trim(),
              status: 'conectada',
            }),
          );
        }
      } else if (existingLichess) {
        updates.push(supabase.from('external_accounts').delete().eq('id', existingLichess.id));
      }

      await Promise.all(updates);
      toast('success', 'Contas de xadrez atualizadas.');
      onSaved();
    } catch {
      toast('error', 'Não foi possível salvar as contas.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Contas de xadrez" maxWidth="max-w-md">
      <div className="space-y-4">
        <p className="text-xs text-content-secondary">
          Informe seu nome de usuário público. Nunca pedimos sua senha — usamos apenas
          dados públicos das plataformas para importar partidas.
        </p>

        <div>
          <label className="label" htmlFor="chesscom-username">Chess.com — username</label>
          <input
            id="chesscom-username"
            className="input"
            placeholder="seu_username"
            value={chesscomUser}
            onChange={(e) => setChesscomUser(e.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="lichess-username">Lichess — username</label>
          <input
            id="lichess-username"
            className="input"
            placeholder="seu_username"
            value={lichessUser}
            onChange={(e) => setLichessUser(e.target.value)}
          />
        </div>

        <Button variant="primary" onClick={save} loading={saving} className="w-full" icon={<Save className="h-4 w-4" />}>
          Salvar contas
        </Button>
      </div>
    </Modal>
  );
}
