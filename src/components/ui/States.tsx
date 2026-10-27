import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = 'Algo deu errado. Tente novamente.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="rounded-full bg-danger-500/10 p-3">
        <AlertTriangle className="h-6 w-6 text-danger-400" />
      </div>
      <p className="text-sm text-content-secondary max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm font-medium text-brand-300 hover:text-brand-200 transition-colors"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center animate-fade-in">
      <div className="rounded-2xl bg-ink-raised p-4 text-brand-300">{icon}</div>
      <div>
        <h3 className="text-lg font-semibold text-content-primary">{title}</h3>
        <p className="text-sm text-content-secondary mt-1 max-w-sm mx-auto">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12">
      <div className="h-5 w-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-content-secondary">{label || 'Carregando…'}</p>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}
