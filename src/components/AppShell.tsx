import { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Search,
  Dumbbell,
  TrendingUp,
  BookOpen,
  User,
  Menu,
  X,
  LogOut,
  ChevronRight,
  Brain,
  CreditCard,
} from 'lucide-react';
import { Logo } from '@/components/Logo';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/components/ui/Toast';

const navItems = [
  { to: '/app', label: 'Início', icon: Home, end: true },
  { to: '/app/analises', label: 'Análises', icon: Search, end: false },
  { to: '/app/diagnostico', label: 'Diagnóstico', icon: Brain, end: false },
  { to: '/app/treinar', label: 'Treinar', icon: Dumbbell, end: false },
  { to: '/app/evolucao', label: 'Evolução', icon: TrendingUp, end: false },
  { to: '/app/repertorio', label: 'Repertório', icon: BookOpen, end: false },
  { to: '/app/assinatura', label: 'Assinatura', icon: CreditCard, end: false },
  { to: '/app/perfil', label: 'Perfil', icon: User, end: false },
];

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    toast('info', 'Você saiu da sua conta.');
    navigate('/', { replace: true });
  };

  const currentLabel =
    navItems.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to) && n.to !== '/app'))?.label ??
    (location.pathname === '/app' ? 'Início' : '');

  return (
    <div className="min-h-screen bg-ink">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-ink-border bg-ink-card">
        <div className="px-5 py-5 border-b border-ink-border">
          <Logo />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'nav-link-active' : ''}`
              }
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-ink-border">
          <div className="px-3 py-2 mb-2">
            <p className="text-sm font-semibold text-content-primary truncate">
              {profile?.display_name || profile?.email || 'Jogador'}
            </p>
            <p className="text-xs text-content-secondary truncate">
              {profile?.email}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            className="nav-link w-full text-danger-400 hover:bg-danger-500/10"
          >
            <LogOut className="h-4.5 w-4.5 shrink-0" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden sticky top-0 z-40 border-b border-ink-border bg-ink/90 backdrop-blur-lg">
        <div className="flex h-16 items-center justify-between px-4">
          <Logo size="sm" />
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-2 text-content-secondary hover:bg-ink-raised"
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileOpen && (
          <div className="border-t border-ink-border bg-ink animate-fade-in px-4 py-3">
            <nav className="space-y-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `nav-link ${isActive ? 'nav-link-active' : ''}`
                  }
                >
                  <item.icon className="h-4.5 w-4.5 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-3 pt-3 border-t border-ink-border">
              <div className="px-3 py-2 mb-2">
                <p className="text-sm font-semibold text-content-primary truncate">
                  {profile?.display_name || 'Jogador'}
                </p>
                <p className="text-xs text-content-secondary truncate">{profile?.email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="nav-link w-full text-danger-400 hover:bg-danger-500/10"
              >
                <LogOut className="h-4.5 w-4.5 shrink-0" />
                Sair
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Desktop topbar */}
        <header className="hidden lg:flex sticky top-0 z-30 border-b border-ink-border bg-ink/80 backdrop-blur-lg">
          <div className="flex items-center gap-2 px-6 py-4 w-full">
            <ChevronRight className="h-4 w-4 text-content-muted" />
            <span className="text-sm font-semibold text-content-primary">{currentLabel}</span>
          </div>
        </header>
        <main className="px-4 sm:px-6 py-6 sm:py-8 max-w-6xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
