import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

let listeners: ((t: Toast) => void)[] = [];

export function toast(type: ToastType, message: string) {
  const t: Toast = { id: crypto.randomUUID(), type, message };
  listeners.forEach((l) => l(t));
}

const config: Record<ToastType, { icon: typeof Info; color: string }> = {
  success: { icon: CheckCircle2, color: 'text-success-400' },
  error: { icon: XCircle, color: 'text-danger-400' },
  info: { icon: Info, color: 'text-cyan-400' },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const listener = (t: Toast) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 4500);
    };
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const { icon: Icon, color } = config[t.type];
        return (
          <div
            key={t.id}
            className="card-raised flex items-start gap-3 px-4 py-3 animate-slide-in"
          >
            <Icon className={`h-5 w-5 shrink-0 ${color}`} />
            <p className="text-sm text-content-primary flex-1 pt-0.5">{t.message}</p>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-content-muted hover:text-content-primary transition-colors"
              aria-label="Dispensar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
