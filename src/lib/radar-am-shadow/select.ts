/**
 * AM Inbox volume-leader selection, mirrored from
 * get-pre-market-workspace + selectVolumeLeaders.
 * Volume DESC, |change%| DESC tie-break. No V2.2 fields.
 */

import {
  AM_SCREENER_SOURCE,
  AM_SCREENER_STALE_MS,
  AM_SHADOW_TOP_N,
  AM_VOLUME_LEADER_LIMIT,
  type AmScreenerShadowRow,
  type ShadowCandidate,
} from "./types";

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? value : null;
}

function positiveOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return n;
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim().toUpperCase();
  if (!s || s.length > 12) return null;
  if (!/^[A-Z][A-Z0-9.\-]*$/.test(s)) return null;
  return s;
}

/** Same contract as pre-market compareByVolumeDesc. */
export function compareAmVolumeDesc(
  a: { volume: number | null; change_percent?: number | null },
  b: { volume: number | null; change_percent?: number | null },
): number {
  const av = a.volume;
  const bv = b.volume;
  if (av === null && bv === null) {
    return Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0);
  }
  if (av === null) return 1;
  if (bv === null) return -1;
  if (bv !== av) return bv - av;
  return Math.abs(b.change_percent ?? 0) - Math.abs(a.change_percent ?? 0);
}

export type AmLeaderSelection = {
  status: "available" | "empty" | "stale";
  rows: AmScreenerShadowRow[];
  droppedNoVolume: number;
  droppedNoTimestamp: number;
};

/**
 * Filter and volume-sort AM screener rows the same way the workspace does,
 * then cap at the backend limit (6).
 */
export function selectAmVolumeLeaders(
  rows: AmScreenerShadowRow[] | null,
  nowMs: number,
  limit: number = AM_VOLUME_LEADER_LIMIT,
): AmLeaderSelection {
  if (!rows) {
    return { status: "empty", rows: [], droppedNoVolume: 0, droppedNoTimestamp: 0 };
  }
  let droppedNoVolume = 0;
  let droppedNoTimestamp = 0;
  let positiveVolumeCandidates = 0;
  const candidates: AmScreenerShadowRow[] = [];
  for (const r of rows) {
    const symbol = normalizeSymbol(r.symbol);
    const volume = positiveOrNull(r.volume);
    if (!symbol || volume === null) {
      droppedNoVolume += 1;
      continue;
    }
    positiveVolumeCandidates += 1;
    const updated = isoOrNull(r.updated_at);
    if (!updated) {
      droppedNoTimestamp += 1;
      continue;
    }
    candidates.push({
      symbol,
      company_name: r.company_name ?? null,
      price: positiveOrNull(r.price),
      change_percent: finiteOrNull(r.change_percent),
      volume,
      rvol: finiteOrNull(r.rvol),
      updated_at: updated,
      provider_as_of: isoOrNull(r.provider_as_of ?? null),
    });
  }
  if (candidates.length === 0) {
    return {
      status: positiveVolumeCandidates > 0 ? "empty" : "empty",
      rows: [],
      droppedNoVolume,
      droppedNoTimestamp,
    };
  }
  const sorted = [...candidates].sort(compareAmVolumeDesc);
  const selected = sorted.slice(0, Math.max(0, limit));
  const stale = selected.some((r) => {
    const t = Date.parse(r.updated_at ?? "");
    if (!Number.isFinite(t)) return false;
    return nowMs - t > AM_SCREENER_STALE_MS;
  });
  return {
    status: stale ? "stale" : "available",
    rows: selected,
    droppedNoVolume,
    droppedNoTimestamp,
  };
}

export function ageMs(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return nowMs - t;
}

export function emptyV22Fields(): Pick<
  ShadowCandidate,
  | "lifecycle"
  | "signalStatus"
  | "rollingVolume5s"
  | "rollingVolume15s"
  | "rollingVolume60s"
  | "rollingDollarVolume60s"
  | "acceleration5m"
  | "sessionVwap"
  | "distanceFromHodPct"
> {
  return {
    lifecycle: null,
    signalStatus: null,
    rollingVolume5s: null,
    rollingVolume15s: null,
    rollingVolume60s: null,
    rollingDollarVolume60s: null,
    acceleration5m: null,
    sessionVwap: null,
    distanceFromHodPct: null,
  };
}

export function mapScreenerCandidate(
  row: AmScreenerShadowRow,
  rank: number,
  nowMs: number,
): ShadowCandidate {
  const provider = isoOrNull(row.provider_as_of ?? null);
  const updated = isoOrNull(row.updated_at);
  return {
    symbol: row.symbol,
    rank,
    price: positiveOrNull(row.price),
    changePercent: finiteOrNull(row.change_percent),
    sessionVolume: positiveOrNull(row.volume),
    providerTimestamp: provider,
    rowTimestamp: updated,
    dataAgeMs: ageMs(updated, nowMs),
    source: AM_SCREENER_SOURCE,
    qualificationState: "included",
    ...emptyV22Fields(),
  };
}

export function amTopN(
  selection: AmLeaderSelection,
  nowMs: number,
  n: number = AM_SHADOW_TOP_N,
): ShadowCandidate[] {
  return selection.rows.slice(0, n).map((row, i) => mapScreenerCandidate(row, i + 1, nowMs));
}
