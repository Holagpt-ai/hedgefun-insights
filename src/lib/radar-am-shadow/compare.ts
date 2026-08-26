import {
  resolveSessionSchedule,
  sessionKindAtMsOfDay,
  type SessionKind,
} from "@/lib/equities-session-calendar";
import { easternParts } from "@/lib/market-session";
import { easternDate } from "@/lib/radar-v22";
import { amTopN, selectAmVolumeLeaders } from "./select";
import { v22TopN } from "./map";
import {
  AM_SCREENER_STALE_MS,
  MATERIAL_NEWER_MS,
  THIN_LIQUID_SESSION_RATIO,
  V22_HIGH_ACTIVITY_VOL60,
  type FreshnessFinding,
  type RankPair,
  type SessionSafetyFinding,
  type ShadowCandidate,
  type ShadowCompareInput,
  type ShadowComparison,
  type VolumeFinding,
} from "./types";

function maxIso(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const v of values) {
    if (!v) continue;
    const t = Date.parse(v);
    if (!Number.isFinite(t)) continue;
    if (t > bestMs) {
      bestMs = t;
      best = v;
    }
  }
  return best;
}

function formatEtClock(nowMs: number): { todayEt: string; evaluatedEt: string } {
  const todayEt = easternDate(nowMs);
  const parts = easternParts(nowMs);
  if (!parts) return { todayEt, evaluatedEt: `${todayEt} ??:?? ET` };
  const hh = String(parts.hour).padStart(2, "0");
  const mm = String(parts.minute).padStart(2, "0");
  return { todayEt, evaluatedEt: `${todayEt} ${hh}:${mm} ET` };
}

export function resolveEvaluationSessionKind(nowMs: number): SessionKind {
  const todayEt = easternDate(nowMs);
  const parts = easternParts(nowMs);
  if (!parts) return "closed";
  const schedule = resolveSessionSchedule(todayEt, []);
  return sessionKindAtMsOfDay(parts.msOfDay, schedule);
}

function overlapOf(
  screener: ShadowCandidate[],
  v22: ShadowCandidate[],
): Pick<ShadowComparison, "overlapCount" | "overlapSymbols" | "screenerOnly" | "v22Only" | "rankPairs" | "orderingDifferences"> {
  const sSet = new Set(screener.map((r) => r.symbol));
  const vSet = new Set(v22.map((r) => r.symbol));
  const overlapSymbols = screener.map((r) => r.symbol).filter((s) => vSet.has(s));
  const screenerOnly = screener.map((r) => r.symbol).filter((s) => !vSet.has(s));
  const v22Only = v22.map((r) => r.symbol).filter((s) => !sSet.has(s));
  const all = new Set([...sSet, ...vSet]);
  const rankBy = (rows: ShadowCandidate[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.symbol, r.rank);
    return m;
  };
  const sRank = rankBy(screener);
  const vRank = rankBy(v22);
  const rankPairs: RankPair[] = [...all].sort().map((symbol) => ({
    symbol,
    screenerRank: sRank.get(symbol) ?? null,
    v22Rank: vRank.get(symbol) ?? null,
  }));
  const orderingDifferences = rankPairs.filter(
    (p) => p.screenerRank !== null && p.v22Rank !== null && p.screenerRank !== p.v22Rank,
  );
  return {
    overlapCount: overlapSymbols.length,
    overlapSymbols,
    screenerOnly,
    v22Only,
    rankPairs,
    orderingDifferences,
  };
}

function freshnessOf(
  screener: ShadowCandidate[],
  v22: ShadowCandidate[],
  v22Status: ShadowComparison["v22Status"],
): FreshnessFinding {
  const screenerProviderAsOfMax = maxIso(screener.map((r) => r.providerTimestamp));
  const screenerUpdatedAtMax = maxIso(screener.map((r) => r.rowTimestamp));
  const v22ProviderAsOfMax = maxIso(v22.map((r) => r.providerTimestamp));
  const sMs = screenerProviderAsOfMax
    ? Date.parse(screenerProviderAsOfMax)
    : screenerUpdatedAtMax
      ? Date.parse(screenerUpdatedAtMax)
      : NaN;
  const vMs = v22ProviderAsOfMax ? Date.parse(v22ProviderAsOfMax) : NaN;
  const both = Number.isFinite(sMs) && Number.isFinite(vMs);
  const v22NewerByMs = both ? vMs - sMs : null;
  const materiallyNewer = v22NewerByMs === null ? null : v22NewerByMs >= MATERIAL_NEWER_MS;
  const screenerStale = screener.some(
    (r) => r.dataAgeMs !== null && r.dataAgeMs > AM_SCREENER_STALE_MS,
  );
  return {
    screenerProviderAsOfMax,
    screenerUpdatedAtMax,
    v22ProviderAsOfMax,
    v22NewerByMs,
    materiallyNewer,
    screenerStale,
    v22Stale: v22Status === "stale",
  };
}

function volumeOf(screener: ShadowCandidate[], v22: ShadowCandidate[]): VolumeFinding {
  const screenerLeader = screener[0] ?? null;
  const v22Leader = v22[0] ?? null;
  const volumeFirstLeaderMatch =
    screenerLeader && v22Leader ? screenerLeader.symbol === v22Leader.symbol : null;
  const screenerVol = screenerLeader?.sessionVolume ?? null;
  const v22Vol = v22Leader?.sessionVolume ?? null;
  const thinOverLiquid =
    screenerLeader !== null &&
    v22Leader !== null &&
    screenerVol !== null &&
    v22Vol !== null &&
    v22Vol < screenerVol * THIN_LIQUID_SESSION_RATIO &&
    v22Leader.rollingVolume60s !== null &&
    v22Leader.rollingVolume60s >= V22_HIGH_ACTIVITY_VOL60 &&
    screenerLeader.symbol !== v22Leader.symbol;

  const screenerSymbols = new Set(screener.map((r) => r.symbol));
  const staleCumulativeSymbols = screener
    .filter((s) => {
      const match = v22.find((v) => v.symbol === s.symbol);
      return match !== undefined && (match.lifecycle === "COOLING" || match.signalStatus === "STALE");
    })
    .map((s) => s.symbol);

  const freshVelocityNotInScreener = v22
    .filter(
      (v) =>
        !screenerSymbols.has(v.symbol) &&
        v.rollingVolume60s !== null &&
        v.rollingVolume60s >= V22_HIGH_ACTIVITY_VOL60 &&
        (v.lifecycle === "ACTIVE" || v.lifecycle === "REACTIVATED" || v.lifecycle === "CONFIRMING"),
    )
    .map((v) => v.symbol);

  return {
    volumeFirstLeaderMatch,
    screenerLeaderSymbol: screenerLeader?.symbol ?? null,
    v22LeaderSymbol: v22Leader?.symbol ?? null,
    thinOverLiquid,
    staleCumulativeSymbols,
    freshVelocityNotInScreener,
    highActivitySymbols: v22
      .filter((v) => v.rollingVolume60s !== null && v.rollingVolume60s >= V22_HIGH_ACTIVITY_VOL60)
      .map((v) => v.symbol),
    acceleratingSymbols: v22
      .filter((v) => v.acceleration5m !== null && v.acceleration5m > 0)
      .map((v) => v.symbol),
    coolingSymbols: v22.filter((v) => v.lifecycle === "COOLING").map((v) => v.symbol),
  };
}

function sessionSafetyOf(input: ShadowCompareInput, todayEt: string, sessionKind: SessionKind): SessionSafetyFinding {
  const rawDate = input.v22RawState?.session_date ?? null;
  const rawCount = input.v22RawRows?.length ?? 0;
  const adoptedCount = input.v22View.valid ? input.v22View.rows.length : 0;
  const dateMismatch = rawDate !== null && rawDate !== todayEt;
  const v22EvaluatesThisSession = sessionKind === "market";
  const leftoverBoardOutsideRegular =
    rawCount > 0 && !v22EvaluatesThisSession && rawDate === todayEt;
  return {
    todayEt,
    evaluationSessionKind: sessionKind,
    v22SessionDate: rawDate,
    v22FeedStatus: input.v22RawState?.status ?? null,
    v22ClientStatus: input.v22View.valid ? input.v22View.status : "unavailable",
    v22RawRowCount: rawCount,
    v22AdoptedRowCount: adoptedCount,
    dateMismatch,
    leftoverBoardOutsideRegular,
    priorSessionBoard: dateMismatch && rawCount > 0,
    v22EvaluatesThisSession,
  };
}

function v22StatusOf(input: ShadowCompareInput): ShadowComparison["v22Status"] {
  if (!input.v22View.valid) return "unavailable";
  if (input.v22View.status === "stale") return "stale";
  if (input.v22View.status === "empty" || input.v22View.rows.length === 0) return "empty";
  return "available";
}

export function compareAmRadarShadow(input: ShadowCompareInput): ShadowComparison {
  const { todayEt, evaluatedEt } = formatEtClock(input.nowMs);
  const sessionKind = input.sessionKind ?? resolveEvaluationSessionKind(input.nowMs);
  const screenerSel = selectAmVolumeLeaders(input.screenerRows, input.nowMs);
  const screenerTop3 = input.screenerRows === null ? [] : amTopN(screenerSel, input.nowMs);
  const screenerStatus: ShadowComparison["screenerStatus"] =
    input.screenerRows === null
      ? "unavailable"
      : screenerTop3.length === 0
        ? "empty"
        : screenerSel.status;
  const v22Status = v22StatusOf(input);
  const feedStale = v22Status === "stale";
  const adoptedBoard = input.v22View.valid
    ? (input.v22RawRows ?? []).filter((r) => r.generation_id === input.v22View.generationId)
    : [];
  const v22Top3 = v22Status === "unavailable" || v22Status === "empty"
    ? []
    : v22TopN(adoptedBoard, input.v22View.rows, input.nowMs, feedStale);

  const overlap = overlapOf(screenerTop3, v22Top3);
  return {
    evaluatedAtIso: new Date(input.nowMs).toISOString(),
    evaluatedEt,
    todayEt,
    sessionKind,
    screenerStatus,
    v22Status,
    screenerTop3,
    v22Top3,
    ...overlap,
    freshness: freshnessOf(screenerTop3, v22Top3, v22Status),
    volume: volumeOf(screenerTop3, v22Top3),
    sessionSafety: sessionSafetyOf(input, todayEt, sessionKind),
  };
}
