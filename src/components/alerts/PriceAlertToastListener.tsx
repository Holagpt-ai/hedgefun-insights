import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { conditionLabel, formatAlertValue } from "@/config/price-alerts.config";
import type { PriceAlertCondition } from "@/lib/price-alerts/types";
import { priceAlertToastViewPath } from "@/lib/alerts/alert-workflow-navigation";
import {
  ensureToastNotificationBaselineMs,
  getToastNotificationBaselineMs,
} from "@/lib/notifications/toast-notification-baseline";
import {
  filterPriceAlertToastBacklog,
  filterPriceAlertToastCandidates,
  markPriceAlertToastSeenDurable,
  markPriceAlertToastSeenInSession,
  mergePriceAlertToastSeenIds,
  PRICE_ALERT_TOAST_BASELINE_NS,
  priceAlertToastSinceIso,
} from "@/lib/price-alerts/toast-delivery";
import { formatPriceAlertToastDescription } from "@/lib/price-alerts/toast-presentation";

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
    ensureToastNotificationBaselineMs(PRICE_ALERT_TOAST_BASELINE_NS, user.id, Date.now());
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
    if (!user?.id) return;
    const nowMs = Date.now();
    sessionSeenRef.current = mergePriceAlertToastSeenIds(user.id, nowMs);
    const baselineMs = getToastNotificationBaselineMs(PRICE_ALERT_TOAST_BASELINE_NS, user.id, nowMs);
    if (!q.data?.length) return;

    const backlog = filterPriceAlertToastBacklog(q.data, sessionSeenRef.current, baselineMs, nowMs);
    for (const row of backlog) {
      sessionSeenRef.current.add(row.id);
      markPriceAlertToastSeenInSession(user.id, row.id);
      markPriceAlertToastSeenDurable(user.id, row.id, nowMs);
    }

    const candidates = filterPriceAlertToastCandidates(q.data, sessionSeenRef.current, {
      baselineMs,
      nowMs,
    });
    for (const row of candidates) {
      sessionSeenRef.current.add(row.id);
      markPriceAlertToastSeenInSession(user.id, row.id);
      markPriceAlertToastSeenDurable(user.id, row.id, nowMs);
      const cond = row.condition_type as PriceAlertCondition;
      const title = `${row.symbol} — ${conditionLabel(cond)}`;
      const description = formatPriceAlertToastDescription({
        observedPrice: Number(row.observed_price),
        thresholdLabel: formatAlertValue(cond, Number(row.threshold)),
        dataLatency: row.data_latency,
        triggeredAt: row.triggered_at,
      });
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
