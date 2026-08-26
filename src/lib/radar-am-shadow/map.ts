import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import type { RadarV22BoardRow } from "@/lib/radar-v22";
import { mapV22Row } from "@/lib/radar-v22";
import { AM_SHADOW_TOP_N, AM_V22_SOURCE, type ShadowCandidate } from "./types";
import { ageMs, emptyV22Fields } from "./select";

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function finiteNonNegativeOrNull(value: unknown): number | null {
  const n = finiteOrNull(value);
  if (n === null || n < 0) return null;
  return n;
}

export function hodDistancePct(price: number | null, dayHigh: number | null): number | null {
  if (price === null || dayHigh === null) return null;
  if (!Number.isFinite(price) || !Number.isFinite(dayHigh) || !(dayHigh > 0)) return null;
  return Math.round(((dayHigh - price) / dayHigh) * 1000) / 10;
}

export function mapV22Candidate(
  row: RadarV22BoardRow,
  nowMs: number,
  feedStale: boolean,
): ShadowCandidate | null {
  const mapped = mapV22Row(row, feedStale ? "stale" : "available");
  if (!mapped) return null;
  const price = finiteOrNull(row.price);
  const dayHigh = finiteOrNull(row.day_high);
  return {
    symbol: row.symbol,
    rank: row.rank,
    price,
    changePercent: finiteOrNull(row.change_percent),
    sessionVolume: finiteOrNull(row.volume),
    providerTimestamp: row.provider_as_of ?? null,
    rowTimestamp: row.updated_at ?? null,
    dataAgeMs: ageMs(row.provider_as_of ?? row.updated_at, nowMs),
    source: AM_V22_SOURCE,
    qualificationState: "included",
    lifecycle: row.lifecycle ?? null,
    signalStatus: row.signal_status ?? null,
    rollingVolume5s: finiteNonNegativeOrNull(row.rolling_volume_5s),
    rollingVolume15s: finiteNonNegativeOrNull(row.rolling_volume_15s),
    rollingVolume60s: finiteNonNegativeOrNull(row.rolling_volume_60s),
    rollingDollarVolume60s: finiteNonNegativeOrNull(row.rolling_dollar_volume_60s),
    acceleration5m: finiteOrNull(row.acceleration_5m),
    sessionVwap: finiteOrNull(row.session_vwap),
    distanceFromHodPct: hodDistancePct(price, dayHigh),
  };
}

export function mapRankedV22Candidate(row: RadarRankedRow, nowMs: number): ShadowCandidate {
  return {
    symbol: row.symbol,
    rank: row.rank,
    price: finiteOrNull(row.price),
    changePercent: finiteOrNull(row.change_percent),
    sessionVolume: finiteOrNull(row.volume),
    providerTimestamp: row.provider_as_of ?? null,
    rowTimestamp: row.updated_at ?? null,
    dataAgeMs: ageMs(row.provider_as_of ?? row.updated_at, nowMs),
    source: AM_V22_SOURCE,
    qualificationState: "included",
    ...emptyV22Fields(),
    lifecycle: row.signal_tier ?? null,
    signalStatus: row.signal_status ?? null,
    rollingVolume5s: finiteNonNegativeOrNull(row.rolling_volume_5s),
    rollingVolume15s: finiteNonNegativeOrNull(row.rolling_volume_15s),
    rollingVolume60s: finiteNonNegativeOrNull(row.rolling_volume_60s),
    acceleration5m: finiteOrNull(row.acceleration_5m),
    distanceFromHodPct: finiteOrNull(row.hod_distance_percent),
  };
}

export function v22TopN(
  boardRows: RadarV22BoardRow[],
  rankedRows: RadarRankedRow[],
  nowMs: number,
  feedStale: boolean,
  n: number = AM_SHADOW_TOP_N,
): ShadowCandidate[] {
  const bySymbol = new Map(boardRows.map((r) => [r.symbol, r]));
  const ordered = [...rankedRows].sort((a, b) => a.rank - b.rank).slice(0, n);
  const out: ShadowCandidate[] = [];
  for (const ranked of ordered) {
    const raw = bySymbol.get(ranked.symbol);
    const mapped = raw
      ? mapV22Candidate(raw, nowMs, feedStale)
      : mapRankedV22Candidate(ranked, nowMs);
    if (mapped) out.push(mapped);
  }
  return out;
}
