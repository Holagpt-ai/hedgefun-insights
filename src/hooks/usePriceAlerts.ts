import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";
import type { PriceAlertCondition, PriceAlertRecurrence } from "@/lib/price-alerts/types";
import { rowToView, type PriceAlertView, type UserPriceAlertRow } from "@/lib/price-alerts/db";

export type RefreshAlertsOptions = {
  /** When true, keep the current list visible (no initial loading state). */
  background?: boolean;
};

export function usePriceAlerts() {
  const { user } = useAuth();
  const userId = user?.id;
  const [alerts, setAlerts] = useState<PriceAlertView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasResolvedListRef = useRef(false);

  useEffect(() => {
    hasResolvedListRef.current = false;
    setLoading(true);
  }, [userId]);

  const refresh = useCallback(async (options?: RefreshAlertsOptions) => {
    if (!userId) {
      setAlerts([]);
      setLoading(false);
      hasResolvedListRef.current = false;
      return;
    }

    const background = options?.background ?? hasResolvedListRef.current;
    if (!background) {
      setLoading(true);
    }
    setError(null);

    const { data, error: qErr } = await supabase
      .from("user_price_alerts")
      .select("*")
      .order("created_at", { ascending: false });

    if (qErr) {
      setError(qErr.message);
      setAlerts([]);
    } else {
      setAlerts(((data ?? []) as UserPriceAlertRow[]).map(rowToView));
    }

    hasResolvedListRef.current = true;
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createAlert = useCallback(
    async (input: {
      symbol: string;
      condition: PriceAlertCondition;
      value: number;
      note?: string;
      enabled: boolean;
      recurrence?: PriceAlertRecurrence;
      referencePrice?: number | null;
    }) => {
      if (!userId) throw new Error("Sign in required.");
      const symbol = normalizeHandoffSymbol(input.symbol);
      if (!symbol) throw new Error("Invalid symbol.");

      const { error: insErr } = await supabase.from("user_price_alerts").insert({
        user_id: userId,
        symbol,
        condition_type: input.condition,
        threshold: input.value,
        reference_price: input.referencePrice ?? null,
        note: input.note ?? null,
        status: input.enabled ? "active" : "paused",
        recurrence: input.recurrence ?? "recurring",
      });
      if (insErr) throw insErr;
      await refresh({ background: true });
    },
    [userId, refresh],
  );

  const updateAlert = useCallback(
    async (
      id: string,
      input: {
        symbol: string;
        condition: PriceAlertCondition;
        value: number;
        note?: string;
        enabled: boolean;
        recurrence?: PriceAlertRecurrence;
      },
    ) => {
      if (!userId) throw new Error("Sign in required.");
      const symbol = normalizeHandoffSymbol(input.symbol);
      if (!symbol) throw new Error("Invalid symbol.");

      const { error: upErr } = await supabase
        .from("user_price_alerts")
        .update({
          symbol,
          condition_type: input.condition,
          threshold: input.value,
          note: input.note ?? null,
          status: input.enabled ? "active" : "paused",
          recurrence: input.recurrence ?? "recurring",
        })
        .eq("id", id);
      if (upErr) throw upErr;
      await refresh({ background: true });
    },
    [userId, refresh],
  );

  const setEnabled = useCallback(
    async (id: string, enabled: boolean) => {
      if (!userId) throw new Error("Sign in required.");
      const { error: upErr } = await supabase
        .from("user_price_alerts")
        .update({ status: enabled ? "active" : "paused" })
        .eq("id", id);
      if (upErr) throw upErr;
      await refresh({ background: true });
    },
    [userId, refresh],
  );

  const deleteAlert = useCallback(
    async (id: string) => {
      if (!userId) throw new Error("Sign in required.");
      const { error: delErr } = await supabase.from("user_price_alerts").delete().eq("id", id);
      if (delErr) throw delErr;
      await refresh({ background: true });
    },
    [userId, refresh],
  );

  const evaluateNow = useCallback(async () => {
    if (!userId) return { evaluated: 0, triggered: 0 };
    const { data, error: fnErr } = await supabase.functions.invoke("evaluate-user-price-alerts");
    if (fnErr) throw fnErr;
    await refresh({ background: true });
    return (data ?? { evaluated: 0, triggered: 0 }) as { evaluated: number; triggered: number };
  }, [userId, refresh]);

  return {
    alerts,
    loading,
    error,
    refresh,
    createAlert,
    updateAlert,
    setEnabled,
    deleteAlert,
    evaluateNow,
  };
}
