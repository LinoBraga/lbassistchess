
import { useState } from 'react';
import {
  CreditCard,
  Crown,
  Check,
  X,
  AlertCircle,
  Loader2,
  RefreshCw,
  TrendingUp,
  Calendar,
  Receipt,
  Ban,
  Info,
} from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/Button';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  ativa: {
    label: 'Ativa',
    color: 'text-success-400',
    bg: 'bg-success-500/10',
  },
  pendente: {
    label: 'Pendente',
    color: 'text-warning-300',
    bg: 'bg-warning-500/10',
  },
  cancelada: {
    label: 'Cancelada',
    color: 'text-content-muted',
    bg: 'bg-ink-raised',
  },
  expirada: {
    label: 'Expirada',
    color: 'text-danger-400',
    bg: 'bg-danger-500/10',
  },
};

const BILLING_LABELS: Record<string, string> = {
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão de crédito',
  PIX: 'PIX',
  UNDEFINED: 'Não definido',
};

function somenteNumeros(value: string): string {
  return value.replace(/\D/g, '');
}

function documentoTemTamanhoValido(value: string): boolean {
  const documento = somenteNumeros(value);
  return documento.length === 11 || documento.length === 14;
}

export function AssinaturaPage() {
  const {
    billing,
    loading,
    error,
    creating,
    createCheckout,
    cancelSubscription,
    refresh,
  } = useSubscription();

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [billingType, setBillingType] = useState('PIX');
  const [cpfCnpj, setCpfCnpj] = useState('');

  if (loading) {
    return <LoadingState label="Carregando assinatura…" />;
  }

  if (error && !billing) {
    return <ErrorState message={error} onRetry={refresh} />;
  }

  const subscription = billing?.subscription;
  const plan = billing?.plan;
  const usage = billing?.usage;

  const statusConfig = subscription?.status
    ? STATUS_CONFIG[subscription.status]
    : null;

  const handleCheckout = async () => {
    if (!plan || creating) return;

    const documento = somenteNumeros(cpfCnpj);

    if (!documentoTemTamanhoValido(documento)) {
      toast(
        'error',
        'Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos.',
      );
      return;
    }

    // Abre a aba durante o clique, antes da chamada assíncrona,
    // para reduzir a possibilidade de bloqueio do navegador.
    const checkoutWindow = window.open('about:blank', '_blank');

    if (!checkoutWindow) {
      toast(
        'error',
        'Permita pop-ups para abrir o checkout de pagamento.',
      );
      return;
    }

    checkoutWindow.document.title = 'Checkout - LB Assist Chess';
    checkoutWindow.document.body.innerHTML =
      '<p style="font-family:sans-serif;padding:24px">Preparando seu pagamento...</p>';

    try {
      const result = await createCheckout(
        'pro',
        billingType,
        documento,
      );

      if (checkoutWindow.closed) {
        toast(
          'info',
          'A solicitação foi processada. Confira o status da assinatura antes de tentar novamente.',
        );
        return;
      }

      if (!result) {
        checkoutWindow.close();
        toast(
          'error',
          'Não foi possível criar o checkout. Confira o documento e o status da assinatura.',
        );
        return;
      }

      if (!result.checkout_url) {
        checkoutWindow.close();

        toast(
          'error',
          'O Asaas não retornou um link de pagamento. Atualize a assinatura antes de tentar novamente, para evitar cobranças duplicadas.',
        );

        await refresh();
        return;
      }

      checkoutWindow.location.href = result.checkout_url;

      toast('info', 'Abrindo o checkout seguro do Asaas.');
    } catch {
      if (!checkoutWindow.closed) {
        checkoutWindow.close();
      }

      toast(
        'error',
        'Ocorreu um erro ao iniciar o checkout. Confira sua conexão e o status da assinatura.',
      );
    }
  };

  const handleCancel = async () => {
    setCanceling(true);

    try {
      const success = await cancelSubscription();

      if (success) {
        setCancelModalOpen(false);

        toast(
          'success',
          'Solicitação de cancelamento concluída. Confira o status atualizado da assinatura.',
        );
      } else {
        toast(
          'error',
          'Não foi possível cancelar a assinatura. Consulte a mensagem de erro e tente novamente.',
        );
      }
    } finally {
      setCanceling(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-content-primary">
          Assinatura
        </h1>

        <p className="mt-1 text-sm text-content-secondary">
          Gerencie seu plano, pagamento e consumo de análises
        </p>
      </div>

      {/* Assinatura atual */}
      {subscription ? (
        <div className="card p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl gradient-brand flex items-center justify-center shrink-0">
                <Crown className="h-6 w-6 text-white" />
              </div>

              <div>
                <h2 className="text-lg font-bold text-content-primary">
                  {subscription.plan_name ?? 'Plano Pro'}
                </h2>

                {statusConfig && (
                  <span
                    className={`chip text-xs mt-1 ${statusConfig.bg} ${statusConfig.color}`}
                  >
                    {statusConfig.label}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <p className="text-2xl font-bold text-content-primary">
                R${' '}
                {subscription.plan_price
                  ?.toFixed(2)
                  .replace('.', ',') ?? '—'}
              </p>

              <p className="text-xs text-content-muted">/mês</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mt-6">
            <div className="rounded-xl bg-ink-raised border border-ink-border p-3">
              <div className="flex items-center gap-1.5 text-content-muted mb-1">
                <Receipt className="h-3.5 w-3.5" />
                <span className="text-xs">Cobrança</span>
              </div>

              <p className="text-sm font-semibold text-content-primary">
                {subscription.billing_type
                  ? BILLING_LABELS[subscription.billing_type] ??
                    subscription.billing_type
                  : '—'}
              </p>
            </div>

            <div className="rounded-xl bg-ink-raised border border-ink-border p-3">
              <div className="flex items-center gap-1.5 text-content-muted mb-1">
                <Calendar className="h-3.5 w-3.5" />
                <span className="text-xs">Início do ciclo</span>
              </div>

              <p className="text-sm font-semibold text-content-primary">
                {subscription.current_period_start
                  ? new Date(
                      subscription.current_period_start,
                    ).toLocaleDateString('pt-BR')
                  : '—'}
              </p>
            </div>

            <div className="rounded-xl bg-ink-raised border border-ink-border p-3">
              <div className="flex items-center gap-1.5 text-content-muted mb-1">
                <Calendar className="h-3.5 w-3.5" />
                <span className="text-xs">Fim do ciclo</span>
              </div>

              <p className="text-sm font-semibold text-content-primary">
                {subscription.current_period_end
                  ? new Date(
                      subscription.current_period_end,
                    ).toLocaleDateString('pt-BR')
                  : '—'}
              </p>
            </div>
          </div>

          {/* Aviso de pagamento pendente */}
          {subscription.status === 'pendente' && (
            <div className="mt-4 rounded-xl bg-warning-500/10 border border-warning-500/20 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning-300 shrink-0 mt-0.5" />

              <div>
                <p className="text-sm font-semibold text-content-primary">
                  Pagamento pendente
                </p>

                <p className="text-xs text-content-secondary mt-1">
                  Sua assinatura está aguardando confirmação de pagamento.
                  {subscription.billing_type === 'BOLETO' &&
                    ' O boleto será enviado para seu e-mail cadastrado.'}{' '}
                  O acesso aos recursos pagos será liberado somente após a
                  confirmação pelo provedor.
                </p>
              </div>
            </div>
          )}

          {/* Aviso de cancelamento */}
          {subscription.status === 'cancelada' && (
            <div className="mt-4 rounded-xl bg-ink-raised border border-ink-border p-4 flex items-start gap-3">
              <X className="h-5 w-5 text-content-muted shrink-0 mt-0.5" />

              <div>
                <p className="text-sm font-semibold text-content-primary">
                  Assinatura cancelada
                </p>

                <p className="text-xs text-content-secondary mt-1">
                  {subscription.canceled_at
                    ? `Cancelada em ${new Date(
                        subscription.canceled_at,
                      ).toLocaleDateString('pt-BR')}.`
                    : 'Assinatura cancelada.'}{' '}
                  Você pode contratar um novo plano quando estiver disponível.
                </p>
              </div>
            </div>
          )}

          {/* Aviso de expiração */}
          {subscription.status === 'expirada' && (
            <div className="mt-4 rounded-xl bg-danger-500/10 border border-danger-500/20 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-danger-400 shrink-0 mt-0.5" />

              <div>
                <p className="text-sm font-semibold text-content-primary">
                  Assinatura expirada
                </p>

                <p className="text-xs text-content-secondary mt-1">
                  A assinatura expirou. Consulte seu histórico de pagamentos
                  antes de contratar novamente.
                </p>
              </div>
            </div>
          )}

          {/* Botão de cancelamento */}
          {(subscription.status === 'ativa' ||
            subscription.status === 'pendente') && (
            <div className="mt-4">
              <Button
                variant="ghost"
                onClick={() => setCancelModalOpen(true)}
                icon={<Ban className="h-4 w-4" />}
                className="text-danger-400 hover:bg-danger-500/10"
              >
                Cancelar assinatura
              </Button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<Crown className="h-8 w-8" />}
          title="Você não tem assinatura ativa"
          description="Contrate o plano Pro para liberar análises ilimitadas, diagnóstico personalizado e treinamento adaptativo."
        />
      )}

      {/* Consumo de análises */}
      {usage && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-content-primary mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-brand-300" />
            Consumo de análises — {usage.period}
          </h3>

          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-content-secondary">
              {usage.analyses_count} de{' '}
              {usage.analyses_limit > 0
                ? usage.analyses_limit
                : 'ilimitado'}
            </span>

            {usage.analyses_limit > 0 && (
              <span className="text-xs text-content-muted">
                {Math.max(
                  0,
                  usage.analyses_limit - usage.analyses_count,
                )}{' '}
                restantes
              </span>
            )}
          </div>

          {usage.analyses_limit > 0 && (
            <div className="w-full h-2 bg-ink-border rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usage.analyses_count >= usage.analyses_limit
                    ? 'bg-danger-500'
                    : usage.analyses_count >= usage.analyses_limit * 0.8
                      ? 'bg-warning-400'
                      : 'bg-brand-500'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    (usage.analyses_count / usage.analyses_limit) * 100,
                  )}%`,
                }}
              />
            </div>
          )}

          <p className="text-xs text-content-muted mt-2">
            Análises canceladas ou falhas não consomem limite. Análises
            reutilizadas (mesma partida) não contam novamente.
          </p>
        </div>
      )}

      {/* Recursos do plano */}
      {plan && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-content-primary mb-4">
            Recursos do plano
          </h3>

          <ul className="space-y-3">
            {plan.features.map((feature) => (
              <li
                key={feature}
                className="flex items-start gap-2.5"
              >
                <div className="h-5 w-5 rounded-full bg-success-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="h-3 w-3 text-success-400" />
                </div>

                <span className="text-sm text-content-secondary">
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Contratação: somente sem assinatura ativa ou com assinatura encerrada */}
      {(!subscription ||
        subscription.status === 'cancelada' ||
        subscription.status === 'expirada') &&
        plan && (
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-content-primary mb-1">
              Contratar plano
            </h3>

            <p className="text-xs text-content-secondary mb-4">
              Informe o documento do titular e escolha a forma de pagamento.
              A assinatura é mensal e recorrente.
            </p>

            {/* Documento do titular */}
            <div className="mb-4">
              <label
                htmlFor="cpfCnpj"
                className="block text-sm font-medium text-content-primary mb-2"
              >
                CPF ou CNPJ do titular
              </label>

              <input
                id="cpfCnpj"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={cpfCnpj}
                onChange={(event) => {
                  setCpfCnpj(
                    somenteNumeros(event.target.value).slice(0, 14),
                  );
                }}
                placeholder="Digite somente os números"
                maxLength={14}
                disabled={creating}
                aria-describedby="cpfCnpj-help"
                className="w-full rounded-xl border border-ink-border bg-ink-raised px-4 py-3 text-content-primary outline-none focus:border-brand-500 disabled:opacity-60"
              />

              <p
                id="cpfCnpj-help"
                className="mt-1 text-xs text-content-muted"
              >
                {cpfCnpj.length <= 11
                  ? `${cpfCnpj.length}/11 dígitos do CPF ou continue até 14 para CNPJ.`
                  : `${cpfCnpj.length}/14 dígitos do CNPJ.`}
              </p>

              <p className="mt-1 text-xs text-content-muted">
                O documento será enviado ao Asaas para identificação do
                titular e processamento do pagamento.
              </p>
            </div>

            {/* Forma de pagamento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {(['PIX', 'CREDIT_CARD'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={creating}
                  onClick={() => setBillingType(type)}
                  aria-pressed={billingType === type}
                  className={`rounded-xl border p-4 text-left transition-colors disabled:opacity-60 ${
                    billingType === type
                      ? 'border-brand-500/50 bg-brand-500/10'
                      : 'border-ink-border hover:border-brand-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="h-4 w-4 text-content-secondary" />

                    <span className="text-sm font-semibold text-content-primary">
                      {BILLING_LABELS[type]}
                    </span>
                  </div>

                  <p className="text-xs text-content-muted">
                    {type === 'PIX' && 'Pagamento via Pix'}
                    {type === 'CREDIT_CARD' &&
                      'Pagamento com cartão de crédito'}
                  </p>
                </button>
              ))}
            </div>

            <Button
              variant="primary"
              onClick={handleCheckout}
              loading={creating}
              className="w-full"
              icon={<Crown className="h-4 w-4" />}
            >
              Contratar R${' '}
              {plan.price_monthly.toFixed(2).replace('.', ',')}/mês
            </Button>

            <p className="text-xs text-content-muted mt-3 text-center">
              O acesso é liberado somente após a confirmação de pagamento
              pelo provedor.
            </p>
          </div>
        )}

      {/* Informações de pagamento */}
      <div className="card p-4 flex items-start gap-3">
        <Info className="h-4 w-4 text-content-muted shrink-0 mt-0.5" />

        <p className="text-xs text-content-secondary leading-relaxed">
          Os pagamentos são processados pelo Asaas. Não armazenamos dados
          de cartão de crédito. O status da assinatura é atualizado por
          webhook após a confirmação do provedor. Em caso de dúvidas,
          entre em contato com o suporte.
        </p>
      </div>

      {/* Modal de confirmação de cancelamento */}
      <Modal
        open={cancelModalOpen}
        onClose={() => {
          if (!canceling) {
            setCancelModalOpen(false);
          }
        }}
        title="Cancelar assinatura"
      >
        <div className="space-y-4">
          <p className="text-sm text-content-secondary">
            Tem certeza de que deseja cancelar esta assinatura? Verifique
            as condições do seu plano antes de confirmar.
          </p>

          <div className="flex gap-3 justify-end">
            <Button
              variant="ghost"
              onClick={() => setCancelModalOpen(false)}
              disabled={canceling}
            >
              Manter assinatura
            </Button>

            <Button
              variant="primary"
              onClick={handleCancel}
              loading={canceling}
              className="bg-danger-500 hover:bg-danger-600"
              icon={<Ban className="h-4 w-4" />}
            >
              Confirmar cancelamento
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
