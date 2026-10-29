import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export interface SubscriptionStatus {
  status: 'pendente' | 'ativa' | 'cancelada' | 'expirada' | null;
  plan_id: string | null;
  plan_name: string | null;
  plan_price: number | null;
  billing_type: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
}

export interface PlanInfo {
  name: string;
  price_monthly: number;
  features: string[];
  limits: { analyses_per_month: number; daily_exercises: number };
}

export interface UsageInfo {
  period: string;
  analyses_count: number;
  analyses_limit: number;
}

interface BillingResponse {
  subscription: SubscriptionStatus | null;
  plan: PlanInfo | null;
  usage: UsageInfo | null;
}

interface CheckoutResponse {
  subscription_id: string;
  checkout_url: string | null;
  invoice_id: string | null;
  billing_type: string;
}

export function useSubscription() {
  const { session } = useAuth();
  const [billing, setBilling] = useState<BillingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchBilling = useCallback(async () => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { VITE_SUPABASE_URL } = import.meta.env;
      const response = await fetch(`${VITE_SUPABASE_URL}/functions/v1/asaas-billing`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Erro ao carregar assinatura (${response.status})`);
      }

      const data: BillingResponse = await response.json();
      setBilling(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar assinatura');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);


  const createCheckout = useCallback(
    async (
      planId: string,
      billingType: string,
      cpfCnpj: string,
    ): Promise<CheckoutResponse | null> => {
      if (!session?.access_token) return null;

      setCreating(true);
      setError(null);

      try {
        const { VITE_SUPABASE_URL } = import.meta.env;

        const response = await fetch(
          `${VITE_SUPABASE_URL}/functions/v1/asaas-checkout`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              plan_id: planId,
              billing_type: billingType,
              cpf_cnpj: cpfCnpj.replace(/\D/g, ''),
            }),
          },
        );

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(
            err.error ?? `Erro ao criar cobrança (${response.status})`,
          );
        }

        const data: CheckoutResponse = await response.json();

        await fetchBilling();
        return data;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Erro ao criar cobrança',
        );
        return null;
      } finally {
        setCreating(false);
      }
    },
    [session?.access_token, fetchBilling],
  );


  const cancelSubscription = useCallback(async (): Promise<boolean> => {
    if (!session?.access_token) return false;
    setError(null);

    try {
      const { VITE_SUPABASE_URL } = import.meta.env;
      const response = await fetch(
        `${VITE_SUPABASE_URL}/functions/v1/asaas-billing?action=cancel`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? `Erro ao cancelar (${response.status})`);
      }

      await fetchBilling();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar assinatura');
      return false;
    }
  }, [session?.access_token, fetchBilling]);

  const hasActiveSubscription = billing?.subscription?.status === 'ativa';

  return {
    billing,
    loading,
    error,
    creating,
    hasActiveSubscription,
    createCheckout,
    cancelSubscription,
    refresh: fetchBilling,
  };
}
