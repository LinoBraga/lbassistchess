import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LandingPage } from '@/pages/LandingPage';
import { LoginPage, SignupPage, ForgotPasswordPage } from '@/pages/AuthPages';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { AppShell } from '@/components/AppShell';
import { DashboardPage } from '@/pages/DashboardPage';
import { GamesListPage } from '@/pages/GamesListPage';
import { GameDetailPage } from '@/pages/GameDetailPage';
import { PerfilPage } from '@/pages/PerfilPage';
import { TreinarPage } from '@/pages/TreinarPage';
import { EvolucaoPage } from '@/pages/EvolucaoPage';
import { DiagnosticoPage } from '@/pages/DiagnosticoPage';
import { AssinaturaPage } from '@/pages/AssinaturaPage';
import { RepertorioPage } from '@/pages/RepertorioPage';
import { PrivacyPage, TermsPage } from '@/pages/LegalPages';
import { ToastContainer } from '@/components/ui/Toast';
import type { ReactNode } from 'react';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/cadastro" element={<SignupPage />} />
        <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
        <Route path="/privacidade" element={<PrivacyPage />} />
        <Route path="/termos" element={<TermsPage />} />

        {/* Onboarding (requires auth) */}
        <Route
          path="/onboarding"
          element={
            <ProtectedRoute>
              <OnboardingPage />
            </ProtectedRoute>
          }
        />

        {/* App (requires auth) */}
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="analises" element={<GamesListPage />} />
          <Route path="analises/:gameId" element={<GameDetailPage />} />
          <Route path="diagnostico" element={<DiagnosticoPage />} />
          <Route path="treinar" element={<TreinarPage />} />
          <Route path="evolucao" element={<EvolucaoPage />} />
          <Route path="assinatura" element={<AssinaturaPage />} />
          <Route path="repertorio" element={<RepertorioPage />} />
          <Route path="perfil" element={<PerfilPage />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
