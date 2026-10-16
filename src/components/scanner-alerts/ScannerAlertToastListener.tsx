import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { scannerAlertToastViewPath } from "@/lib/alerts/alert-workflow-navigation";
import {
  filterUnseenScannerAlerts,
  markScannerToastSeen,
  markScannerToastSeenDurable,
  mergeScannerToastSeenKeys,
  scannerAlertToastKey,
} from "@/lib/scanner-alerts/toast-dedupe";
import {
  formatScannerAlertMetricLine,
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
    if (!user?.id || !q.data?.length) return;
    const unseen = filterUnseenScannerAlerts(q.data, seenRef.current);
    for (const row of unseen.slice(0, 3)) {
      const toastKey = scannerAlertToastKey(row);
      const title = row.headline ||
        `${row.symbol} — ${formatScannerEventLabel(row.event_type) ?? row.event_type}`;
      const metrics = formatScannerAlertMetricLine(row);
      const repeat = repeatMoverContextLine(row);
      const description = [metrics, repeat].filter(Boolean).join("\n");
      markScannerToastSeen(toastKey);
      markScannerToastSeenDurable(user.id, toastKey);
      seenRef.current.add(toastKey);
      const viewPath = scannerAlertToastViewPath(row);
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
