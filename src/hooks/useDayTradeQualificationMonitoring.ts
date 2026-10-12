import { useEffect, useState } from "react";
import { easternDate } from "@/lib/radar-v22";
import {
  fetchDayTradeQualificationStates,
  monitoringStates,
  type DayTradeQualificationStateRow,
} from "@/lib/day-trade/qualification-lifecycle-client";

export function useDayTradeQualificationMonitoring(enabled = true): {
  states: DayTradeQualificationStateRow[];
  monitoring: DayTradeQualificationStateRow[];
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
} {
  const sessionDate = easternDate(Date.now());
  const [states, setStates] = useState<DayTradeQualificationStateRow[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!enabled || !sessionDate) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      const result = await fetchDayTradeQualificationStates(sessionDate);
      if (cancelled) return;
      setStates(result.rows);
      setError(result.error);
      setIsLoading(false);
    };
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, sessionDate, reloadToken]);

  return {
    states,
    monitoring: monitoringStates(states),
    isLoading,
    error,
    retry: () => setReloadToken((n) => n + 1),
  };
}
