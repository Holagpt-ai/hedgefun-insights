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
} {
  const sessionDate = easternDate(Date.now());
  const [states, setStates] = useState<DayTradeQualificationStateRow[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || !sessionDate) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await fetchDayTradeQualificationStates(sessionDate);
        if (!cancelled) {
          setStates(rows);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("qualification_load_failed"));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, sessionDate]);

  return {
    states,
    monitoring: monitoringStates(states),
    isLoading,
    error,
  };
}
