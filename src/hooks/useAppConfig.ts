import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  currency: string;
  features: string[];
  limits: { analyses_per_month: number; daily_exercises: number };
}

export interface SystemLimits {
  max_pgn_file_mb: number;
  max_concurrent_analyses: number;
  analysis_depth: number;
  min_games_for_report: number;
}

interface Config {
  plans: Plan[];
  systemLimits: SystemLimits | null;
  loading: boolean;
  error: string | null;
}

export function useAppConfig(): Config {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [systemLimits, setSystemLimits] = useState<SystemLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('app_config')
        .select('key, value')
        .eq('is_public', true);

      if (!active) return;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      for (const row of data ?? []) {
        if (row.key === 'plans') setPlans(row.value as unknown as Plan[]);
        if (row.key === 'system_limits')
          setSystemLimits(row.value as unknown as SystemLimits);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { plans, systemLimits, loading, error };
}
