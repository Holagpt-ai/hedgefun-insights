import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { scannerAlertToastViewPath } from "@/lib/alerts/alert-workflow-navigation";
import {
  ensureToastNotificationBaselineMs,
  getToastNotificationBaselineMs,
} from "@/lib/notifications/toast-notification-baseline";
import {
  filterLiveScannerAlertToasts,
  filterScannerAlertToastBacklog,
  markScannerToastSeen,
  markScannerToastSeenDurable,
  mergeScannerToastSeenKeys,
  SCANNER_ALERT_TOAST_BASELINE_NS,
  scannerAlertToastKey,
} from "@/lib/scanner-alerts/toast-dedupe";
import {
  formatScannerAlertMetricLine,
  formatScannerAlertObservationLine,
  repeatMoverContextLine,
} from "@/lib/scanner-alerts/format-scanner-alert-metrics";
import type { ScannerIntelligenceAlertRow } from "@/types/scanner-intelligence-alert";
import { formatScannerEventLabel } from "@/lib/screeners/scanner-events-display";

const POLL_MS = 45_000;

export function ScannerAlertToastListener() {
  const { user } = useAuth();
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) {
      seenRef.current = new Set();
      return;
    }
    seenRef.current = mergeScannerToastSeenKeys(user.id);
    ensureToastNotificationBaselineMs(SCANNER_ALERT_TOAST_BASELINE_NS, user.id, Date.now());
  }, [user?.id]);

  const q = useQuery({
    queryKey: ["scanner-alert-toasts", user?.id],
    enabled: !!user?.id,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<ScannerIntelligenceAlertRow[]> => {
      const since = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("scanner_intelligence_alerts")
        .select(
          "id, dedupe_key, symbol, event_type, event_at, headline, summary, rvol_5m, volume_velocity, today_volume, comparable_episode_count, historical_match_count, metadata, created_at",
        )
        .gte("event_at", since)
        .order("event_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ScannerIntelligenceAlertRow[];
    },
  });

  useEffect(() => {
    if (!user?.id) return;
    const nowMs = Date.now();
    seenRef.current = mergeScannerToastSeenKeys(user.id, nowMs);
    const baselineMs = getToastNotificationBaselineMs(SCANNER_ALERT_TOAST_BASELINE_NS, user.id, nowMs);
    if (!q.data?.length) return;

    const backlog = filterScannerAlertToastBacklog(q.data, seenRef.current, baselineMs, nowMs);
    for (const row of backlog) {
      const toastKey = scannerAlertToastKey(row);
      seenRef.current.add(toastKey);
      markScannerToastSeen(user.id, toastKey);
      markScannerToastSeenDurable(user.id, toastKey, nowMs);
    }

    const live = filterLiveScannerAlertToasts(q.data, seenRef.current, baselineMs, nowMs);
    for (const row of live.slice(0, 3)) {
      const toastKey = scannerAlertToastKey(row);
      const title = row.headline ||
        `${row.symbol} — ${formatScannerEventLabel(row.event_type) ?? row.event_type}`;
      const metrics = formatScannerAlertMetricLine(row);
      const repeat = repeatMoverContextLine(row);
      const observation = formatScannerAlertObservationLine(row.event_at);
      const description = [metrics, repeat, observation].filter(Boolean).join("\n");
      seenRef.current.add(toastKey);
      markScannerToastSeen(user.id, toastKey);
      markScannerToastSeenDurable(user.id, toastKey, nowMs);
      const viewPath = scannerAlertToastViewPath({
        symbol: row.symbol,
        event_type: row.event_type,
        event_at: row.event_at,
      });
      toast(title, {
        description,
        duration: 8_000,
        closeButton: true,
        action: {
          label: "View",
          onClick: () => {
            window.location.href = viewPath;
          },
        },
      });
    }
  }, [q.data, user?.id]);

  return null;
}
