import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lastCompletedUsTradingSession } from "@/lib/radar/carryover-session";
import {
  assembleCarryoverWatch,
  type CarryoverWatchView,
} from "@/lib/radar/carryover-watch";
import { fetchDayTradeQualificationStates } from "@/lib/day-trade/qualification-lifecycle-client";

const SNAPSHOT_SELECT = [
  "symbol",
  "trading_date",
  "session_kind",
  "last_price",
  "session_volume",
  "previous_close",
  "volume_velocity",
  "volume_acceleration_pct",
  "distance_from_hod_pct",
  "scanner_events",
  "primary_scanner_event",
  "captured_at",
].join(",");

function db(): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

async function readSnapshot(
  table: "radar_v22_carryover_snapshot" | "radar_v22_closed_snapshot",
  sessionDate: string,
): Promise<{ rows: unknown[] | null; error: string | null }> {
  const res = await db()
    .from(table)
    .select(SNAPSHOT_SELECT)
    .eq("trading_date", sessionDate)
    .limit(200);
  if (res.error) return { rows: null, error: res.error.message };
  return { rows: (res.data ?? []) as unknown[], error: null };
}

export async function loadCarryoverWatch(now: Date): Promise<CarryoverWatchView> {
  const session = lastCompletedUsTradingSession(now);
  const [carryover, closed, pillars] = await Promise.all([
    readSnapshot("radar_v22_carryover_snapshot", session.sessionDate),
    readSnapshot("radar_v22_closed_snapshot", session.sessionDate),
    fetchDayTradeQualificationStates(session.sessionDate),
  ]);
  return assembleCarryoverWatch({
    sessionDate: session.sessionDate,
    sessionLabel: session.sessionLabel,
    carryoverRows: carryover.rows,
    carryoverError: carryover.error,
    closedRows: closed.rows,
    closedError: closed.error,
    pillars: pillars.error ? null : pillars.rows,
    pillarError: pillars.error ? pillars.error.message : null,
  });
}

export function useCarryoverWatch(nowMs: number): {
  loading: boolean;
  view: CarryoverWatchView | null;
} {
  const sessionDate = lastCompletedUsTradingSession(new Date(nowMs)).sessionDate;
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CarryoverWatchView | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadCarryoverWatch(new Date(nowMs))
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch(() => {
        if (cancelled) return;
        const session = lastCompletedUsTradingSession(new Date(nowMs));
        setView({
          status: "unavailable",
          sessionDate: session.sessionDate,
          sessionLabel: session.sessionLabel,
          unavailableReason:
            "Prior-session snapshot unavailable. The historical carryover source could not be read.",
          sourceNote: null,
          pillarNote: null,
          candidates: [],
          withheldInvalidQuotes: 0,
          historicalNotice:
            "Historical prior-session record. A previous-session pass does not qualify the current session.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Refetch when the completed session date changes, not on every clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDate]);

  return { loading, view };
}
