/**
 * Closed-session Radar display snapshot.
 *
 * `radar_v22_candidates` stays empty after close. The last same-session
 * candidate payload is kept only as an explicit closed-session snapshot.
 * Yesterday's snapshot is never today's board.
 */

import {
  mapCandidateToScreenerRow,
  qualifyCandidateForTab,
  rankRadarV2Candidates,
  tabDisplayLimit,
  type RadarV2CandidateRow,
  type RadarV2Decision,
} from "@/lib/screeners/radar-v2-adapter";
import { surveillanceTradingDateFromMs } from "@/lib/screeners/screener-session";

export const CLOSED_SESSION_SNAPSHOT_KIND = "closed_session" as const;

export const CLOSED_RADAR_SNAPSHOT_STATUS = "Closed — showing last active Radar state";

export const CLOSED_VOLUME_TREND_CONTEXT = "Last active state";

export interface RadarClosedSnapshotRow extends RadarV2CandidateRow {
  snapshot_kind: typeof CLOSED_SESSION_SNAPSHOT_KIND;
  captured_at: string;
}

export interface ClosedSnapshotStore<T extends { trading_date: string }> {
  live: T[];
  snapshot: Array<T & { snapshot_kind: typeof CLOSED_SESSION_SNAPSHOT_KIND; captured_at: string }>;
}

/**
 * Persistence rule used by replace_radar_v22_candidates_v1.
 * Live rows are replaced by the incoming set. A non-empty live set is copied
 * into the snapshot only when the incoming write is an empty closed session
 * for the same surveillance date. A later empty closed write keeps that copy.
 * A different surveillance date drops the prior snapshot.
 */
export function retainClosedSessionSnapshot<T extends { trading_date: string }>(
  state: ClosedSnapshotStore<T>,
  incoming: {
    tradingDate: string;
    sessionKind: string;
    candidates: T[];
    capturedAt: string;
  },
): ClosedSnapshotStore<T> {
  let snapshot = state.snapshot.filter((row) => row.trading_date === incoming.tradingDate);
  if (incoming.sessionKind === "closed" && incoming.candidates.length === 0) {
    const liveToday = state.live.filter((row) => row.trading_date === incoming.tradingDate);
    if (liveToday.length > 0) {
      snapshot = liveToday.map((row) => ({
        ...row,
        snapshot_kind: CLOSED_SESSION_SNAPSHOT_KIND,
        captured_at: incoming.capturedAt,
      }));
    }
  }
  return {
    live: incoming.candidates,
    snapshot,
  };
}

export function acceptClosedSessionSnapshot(
  input: {
    feedSessionKind: string | null | undefined;
    surveillanceDate: string | null;
    rows: readonly RadarClosedSnapshotRow[] | null | undefined;
  },
): RadarClosedSnapshotRow[] | null {
  if (input.feedSessionKind !== "closed") return null;
  if (!input.surveillanceDate) return null;
  const rows = input.rows ?? [];
  if (rows.length === 0) return null;
  const accepted: RadarClosedSnapshotRow[] = [];
  for (const row of rows) {
    if (row.snapshot_kind !== CLOSED_SESSION_SNAPSHOT_KIND) return null;
    if (row.trading_date !== input.surveillanceDate) return null;
    accepted.push(row);
  }
  return accepted;
}

export function resolveClosedSessionSnapshotDecision(input: {
  liveDecision: RadarV2Decision;
  tabId: string;
  nowMs: number;
  rows: readonly RadarClosedSnapshotRow[] | null | undefined;
}): RadarV2Decision | null {
  if (input.liveDecision.source === "radar-v2") return null;
  if (input.liveDecision.reason !== "session_not_active:closed") return null;
  const accepted = acceptClosedSessionSnapshot({
    feedSessionKind: "closed",
    surveillanceDate: surveillanceTradingDateFromMs(input.nowMs),
    rows: input.rows,
  });
  if (!accepted) return null;

  const ranked = rankRadarV2Candidates(accepted);
  const qualified = ranked.filter((row) => qualifyCandidateForTab(row, input.tabId));
  if (qualified.length === 0) return null;
  const limit = tabDisplayLimit(input.tabId);
  const mapped = qualified.slice(0, limit).map((row) => mapCandidateToScreenerRow(row, input.tabId));
  const capturedAt = accepted
    .map((row) => row.captured_at)
    .filter((value) => typeof value === "string" && value.length > 0)
    .sort()
    .at(-1) ?? null;

  return {
    source: "radar-v2",
    reason: "closed_session_snapshot",
    session: "closed",
    view: {
      status: "available",
      rows: mapped,
      synced_at: capturedAt,
      provider_as_of_max: null,
      closedSnapshot: true,
    },
  };
}
