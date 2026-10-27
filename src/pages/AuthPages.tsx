import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowLeft } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-ink gradient-hero">
      <div className="px-4 sm:px-6 py-5">
        <Logo />
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md animate-fade-in">{children}</div>
      </div>
    </div>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-danger-400 flex items-center gap-1">{children}</p>;
}

function emailValid(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  const from = (location.state as { from?: string })?.from || '/app';

  useEffect(() => {
    if (session) navigate(from, { replace: true });
  }, [session, navigate, from]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!emailValid(email)) errs.email = 'Informe um e-mail válido.';
    if (password.length < 6) errs.password = 'A senha deve ter ao menos 6 caracteres.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      const msg =
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : error.message;
      setErrors({ form: msg });
      return;
    }
    toast('success', 'Bem-vindo de volta!');
    navigate(from, { replace: true });
  };

  return (
    <AuthShell>
      <div className="card-raised p-7">
        <h1 className="text-2xl font-bold text-content-primary">Entrar</h1>
        <p className="mt-1.5 text-sm text-content-secondary">
          Acesse seu painel de treinamento.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
              <input
                id="email"
                type="email"
                className="input pl-10"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                aria-invalid={!!errors.email}
              />
            </div>
            {errors.email && <FieldError><AlertCircle className="h-3 w-3" />{errors.email}</FieldError>}
          </div>

          <div>
            <label className="label" htmlFor="password">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                className="input pl-10 pr-10"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary"
                aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <FieldError><AlertCircle className="h-3 w-3" />{errors.password}</FieldError>}
          </div>

          {errors.form && (
            <div className="rounded-xl bg-danger-500/10 border border-danger-500/30 px-4 py-3 text-sm text-danger-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errors.form}
            </div>
          )}

          <div className="flex justify-end">
            <Link to="/recuperar-senha" className="text-xs font-medium text-brand-300 hover:text-brand-200">
              Esqueceu sua senha?
            </Link>
          </div>

          <Button type="submit" loading={loading} className="w-full">
            Entrar
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-content-secondary">
          Não tem conta?{' '}
          <Link to="/cadastro" className="font-semibold text-brand-300 hover:text-brand-200">
            Criar agora
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

/* ----------------------------------------------------------- Signup */
export function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; confirm?: string; form?: string }>({});

  const from = (location.state as { from?: string })?.from || '/app';

  useEffect(() => {
    if (session) navigate(from, { replace: true });
  }, [session, navigate, from]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!emailValid(email)) errs.email = 'Informe um e-mail válido.';
    if (password.length < 6) errs.password = 'A senha deve ter ao menos 6 caracteres.';
    if (confirm !== password) errs.confirm = 'As senhas não conferem.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      setErrors({ form: error.message });
      return;
    }
    if (data.session) {
      toast('success', 'Conta criada! Vamos configurar seu treinamento.');
      navigate('/onboarding', { replace: true });
    } else {
      toast('info', 'Verifique seu e-mail para confirmar a conta.');
      navigate('/login', { replace: true });
    }
  };

  return (
    <AuthShell>
      <div className="card-raised p-7">
        <h1 className="text-2xl font-bold text-content-primary">Criar conta</h1>
        <p className="mt-1.5 text-sm text-content-secondary">
          Comece a descobrir suas fraquezas hoje.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
          <div>
            <label className="label" htmlFor="su-email">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
              <input
                id="su-email"
                type="email"
                className="input pl-10"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                aria-invalid={!!errors.email}
              />
            </div>
            {errors.email && <FieldError><AlertCircle className="h-3 w-3" />{errors.email}</FieldError>}
          </div>

          <div>
            <label className="label" htmlFor="su-password">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
              <input
                id="su-password"
                type={showPass ? 'text' : 'password'}
                className="input pl-10 pr-10"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content-secondary"
                aria-label={showPass ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <FieldError><AlertCircle className="h-3 w-3" />{errors.password}</FieldError>}
          </div>

          <div>
            <label className="label" htmlFor="su-confirm">Confirmar senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
              <input
                id="su-confirm"
                type={showPass ? 'text' : 'password'}
                className="input pl-10"
                placeholder="Repita a senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                aria-invalid={!!errors.confirm}
              />
            </div>
            {errors.confirm && <FieldError><AlertCircle className="h-3 w-3" />{errors.confirm}</FieldError>}
          </div>

          {errors.form && (
            <div className="rounded-xl bg-danger-500/10 border border-danger-500/30 px-4 py-3 text-sm text-danger-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errors.form}
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Criar conta
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-content-secondary">
          Já tem conta?{' '}
          <Link to="/login" className="font-semibold text-brand-300 hover:text-brand-200">
            Entrar
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

/* ---------------------------------------------------- Password recovery */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailValid(email)) {
      setError('Informe um e-mail válido.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
    toast('success', 'Se o e-mail existir, as instruções foram enviadas.');
  };

  return (
    <AuthShell>
      <div className="card-raised p-7">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-xs text-content-secondary hover:text-content-primary mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para entrar
        </Link>
        <h1 className="text-2xl font-bold text-content-primary">Recuperar senha</h1>
        <p className="mt-1.5 text-sm text-content-secondary">
          Enviaremos um link para redefinir sua senha.
        </p>

        {sent ? (
          <div className="mt-6 rounded-xl bg-success-500/10 border border-success-500/30 px-4 py-4 text-sm text-success-400">
            Se o e-mail estiver cadastrado, você receberá as instruções em
            instantes. Verifique também a caixa de spam.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="fp-email">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-muted" />
                <input
                  id="fp-email"
                  type="email"
                  className="input pl-10"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>
            {error && <FieldError><AlertCircle className="h-3 w-3" />{error}</FieldError>}
            <Button type="submit" loading={loading} className="w-full">
              Enviar link de recuperação
            </Button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
