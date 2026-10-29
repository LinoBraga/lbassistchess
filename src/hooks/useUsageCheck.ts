import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface UsageCheckResult {
  can_analyze: boolean;
  current_count: number;
  limit: number;
  remaining: number;
  period: string;
  has_active_subscription: boolean;
}

export function useUsageCheck() {
  const { session } = useAuth();
  const [checking, setChecking] = useState(false);
  const [usageInfo, setUsageInfo] = useState<UsageCheckResult | null>(null);

  const checkUsage = useCallback(async (): Promise<UsageCheckResult | null> => {
    if (!session?.access_token) return null;
    setChecking(true);

    try {
      const { VITE_SUPABASE_URL } = import.meta.env;
      const response = await fetch(`${VITE_SUPABASE_URL}/functions/v1/asaas-usage`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) return null;

      const data: UsageCheckResult = await response.json();
      setUsageInfo(data);
      return data;
    } catch {
      return null;
    } finally {
      setChecking(false);
    }
  }, [session?.access_token]);

  const incrementUsage = useCallback(
    async (gameId: string): Promise<boolean> => {
      if (!session?.access_token) return false;

      try {
        const { VITE_SUPABASE_URL } = import.meta.env;
        const response = await fetch(
          `${VITE_SUPABASE_URL}/functions/v1/asaas-usage?action=increment`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ game_id: gameId }),
          },
        );

        return response.ok;
      } catch {
        return false;
      }
    },
    [session?.access_token],
  );

  return { checking, usageInfo, checkUsage, incrementUsage };
}
