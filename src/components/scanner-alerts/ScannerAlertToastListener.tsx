import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  filterUnseenScannerAlerts,
  markScannerToastSeen,
  readSeenScannerToastKeys,
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
  const seenRef = useRef(readSeenScannerToastKeys());

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
    if (!q.data?.length) return;
    const unseen = filterUnseenScannerAlerts(q.data, seenRef.current);
    for (const row of unseen.slice(0, 3)) {
      const title = row.headline ||
        `${row.symbol} — ${formatScannerEventLabel(row.event_type) ?? row.event_type}`;
      const metrics = formatScannerAlertMetricLine(row);
      const repeat = repeatMoverContextLine(row);
      const description = [metrics, repeat].filter(Boolean).join("\n");
      markScannerToastSeen(row.dedupe_key);
      seenRef.current.add(row.dedupe_key);
      toast(title, {
        description,
        duration: 12_000,
        action: {
          label: "View",
          onClick: () => {
            window.location.href = "/dashboard/action-center";
          },
        },
      });
    }
  }, [q.data]);

  return null;
}
