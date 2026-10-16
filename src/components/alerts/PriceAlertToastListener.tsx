import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { conditionLabel, formatAlertValue } from "@/config/price-alerts.config";
import type { PriceAlertCondition } from "@/lib/price-alerts/types";
import { priceAlertToastViewPath } from "@/lib/alerts/alert-workflow-navigation";
import {
  filterPriceAlertToastCandidates,
  markPriceAlertToastSeenDurable,
  markPriceAlertToastSeenInSession,
  mergePriceAlertToastSeenIds,
  priceAlertToastSinceIso,
} from "@/lib/price-alerts/toast-delivery";

const POLL_MS = 60_000;

export function PriceAlertToastListener() {
  const { user } = useAuth();
  const sessionSeenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) {
      sessionSeenRef.current = new Set();
      return;
    }
    sessionSeenRef.current = mergePriceAlertToastSeenIds(user.id);
  }, [user?.id]);

  const q = useQuery({
    queryKey: ["price-alert-toasts", user?.id],
    enabled: !!user?.id,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const since = priceAlertToastSinceIso(Date.now());
      const { data, error } = await supabase
        .from("user_price_alert_triggers")
        .select(
          "id, symbol, condition_type, threshold, observed_price, data_latency, delivery_status, seen_at, triggered_at",
        )
        .eq("delivery_status", "delivered")
        .is("seen_at", null)
        .gte("triggered_at", since)
        .order("triggered_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!user?.id || !q.data?.length) return;
    const candidates = filterPriceAlertToastCandidates(q.data, sessionSeenRef.current);
    for (const row of candidates) {
      sessionSeenRef.current.add(row.id);
      markPriceAlertToastSeenInSession(row.id);
      markPriceAlertToastSeenDurable(user.id, row.id);
      const cond = row.condition_type as PriceAlertCondition;
      const title = `${row.symbol} — ${conditionLabel(cond)}`;
      const description = `Observed $${Number(row.observed_price).toFixed(2)} vs ${formatAlertValue(cond, Number(row.threshold))} (${row.data_latency})`;
      const viewPath = priceAlertToastViewPath(row.symbol);
      toast(title, {
        description,
        duration: 14_000,
        action: {
          label: "View",
          onClick: () => {
            window.location.href = viewPath;
          },
        },
      });
      void supabase
        .from("user_price_alert_triggers")
        .update({ seen_at: new Date().toISOString() })
        .eq("id", row.id)
        .then(({ error: ackErr }) => {
          if (ackErr) {
            console.error("[price-alert-toast] failed to persist seen_at", ackErr.message, row.id);
          }
        });
    }
  }, [q.data, user?.id]);

  return null;
}
