import { readEarningsFacts, type CatalystLike } from "./contract.ts";

/** Bounded fetch for today's authoritative earnings-calendar catalyst rows. */
export const EARNINGS_CALENDAR_FETCH_LIMIT = 320;

export type EarningsReleaseState = "scheduled" | "reported";

export type EarningsPriorityReason =
  | "Earnings surprise"
  | "High trading activity"
  | "Large-cap report"
  | "On your watchlist"
  | "Reported results";

export interface EarningsSymbolMarketMetadata {
  market_cap: number | null;
  volume: number | null;
  rvol_20d: number | null;
  change_percent: number | null;
  price: number | null;
  /** True only when screener activity fields passed freshness and tab provenance checks. */
  activity_verified: boolean;
  activity_as_of: string | null;
  activity_tab_id: string | null;
}

export function emptyEarningsSymbolMetadata(): EarningsSymbolMarketMetadata {
  return {
    market_cap: null,
    volume: null,
    rvol_20d: null,
    change_percent: null,
    price: null,
    activity_verified: false,
    activity_as_of: null,
    activity_tab_id: null,
  };
}

export interface EarningsMarketImpactScore {
  total: number;
  surprise: number;
  activity: number;
  significance: number;
  watchlist: number;
  releaseState: EarningsReleaseState;
  priorityReason: EarningsPriorityReason | null;
}

export type EarningsRankable = CatalystLike & {
  symbol: string;
  facts?: unknown;
};

function finiteOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function log10Cap(value: number, cap: number): number {
  if (value <= 0 || !Number.isFinite(value)) return 0;
  return Math.min(cap, Math.log10(value));
}

/** Deterministic market-impact score — no LLM, no ticker whitelist. */
export function scoreEarningsMarketImpact(
  row: EarningsRankable,
  opts: {
    onWatchlist: boolean;
    metadata: EarningsSymbolMarketMetadata | null | undefined;
  },
): EarningsMarketImpactScore {
  const facts = readEarningsFacts(row.facts);
  const meta = opts.metadata ?? emptyEarningsSymbolMetadata();

  const hasActual = facts.actual_eps !== null;
  const releaseState: EarningsReleaseState = hasActual ? "reported" : "scheduled";

  const surprisePoints = scoreEarningsSurprisePoints(facts);

  let activity = 0;
  if (meta.activity_verified) {
    const rvol = finiteOrNull(meta.rvol_20d);
    const volume = finiteOrNull(meta.volume);
    const changePct = finiteOrNull(meta.change_percent);
    if (rvol !== null) {
      activity = Math.min(420, Math.round(rvol * 85));
    }
    if (volume !== null) {
      activity = Math.max(activity, Math.round(log10Cap(volume, 7) * 55));
    }
    if (changePct !== null) {
      activity = Math.max(activity, Math.min(280, Math.round(Math.abs(changePct) * 18)));
    }
  }

  const cap = finiteOrNull(meta.market_cap);
  let significance = 0;
  if (cap !== null && cap > 0) {
    significance = Math.round(log10Cap(cap, 12) * 42);
    if (cap >= 50_000_000_000) significance = Math.max(significance, 320);
    else if (cap >= 10_000_000_000) significance = Math.max(significance, 240);
    else if (cap >= 2_000_000_000) significance = Math.max(significance, 160);
  }

  const blendedSignificance =
    meta.activity_verified && activity >= 220
      ? Math.max(significance, Math.min(activity, 280))
      : significance;

  const watchlist = opts.onWatchlist ? 80 : 0;

  const total =
    surprisePoints * 1_000 +
    activity * 10 +
    blendedSignificance * 100 +
    watchlist;

  const priorityReason = pickEarningsPriorityReason({
    surprisePoints,
    activity,
    activityVerified: meta.activity_verified,
    significance: blendedSignificance,
    onWatchlist: opts.onWatchlist,
    releaseState,
  });

  return {
    total,
    surprise: surprisePoints,
    activity,
    significance: blendedSignificance,
    watchlist,
    releaseState,
    priorityReason,
  };
}

/** Bounded surprise points — negligible beats do not dominate cap/activity bands. */
export function scoreEarningsSurprisePoints(facts: {
  estimate_eps: number | null;
  actual_eps: number | null;
  surprise_percent: number | null;
}): number {
  if (facts.surprise_percent !== null) {
    const abs = Math.abs(facts.surprise_percent);
    if (abs < 3) return Math.round(abs * 4);
    if (abs < 12) return 12 + Math.round((abs - 3) * 6);
    return Math.min(450, 66 + Math.round((abs - 12) * 10));
  }
  if (facts.actual_eps !== null && facts.estimate_eps !== null) {
    const delta = Math.abs(facts.actual_eps - facts.estimate_eps);
    if (delta < 0.05) return Math.round(delta * 80);
    return Math.min(320, 4 + Math.round(delta * 100));
  }
  if (facts.actual_eps !== null) return 40;
  return 0;
}

function pickEarningsPriorityReason(input: {
  surprisePoints: number;
  activity: number;
  activityVerified: boolean;
  significance: number;
  onWatchlist: boolean;
  releaseState: EarningsReleaseState;
}): EarningsPriorityReason | null {
  const ranked: Array<{ score: number; reason: EarningsPriorityReason }> = [];
  if (input.surprisePoints >= 66) {
    ranked.push({ score: input.surprisePoints, reason: "Earnings surprise" });
  }
  if (input.releaseState === "reported" && input.surprisePoints < 66) {
    ranked.push({ score: 40, reason: "Reported results" });
  }
  if (input.activityVerified && input.activity >= 180) {
    ranked.push({ score: input.activity, reason: "High trading activity" });
  }
  if (input.significance >= 200) {
    ranked.push({ score: input.significance, reason: "Large-cap report" });
  }
  if (input.onWatchlist) ranked.push({ score: 80, reason: "On your watchlist" });
  ranked.sort((a, b) => b.score - a.score || a.reason.localeCompare(b.reason));
  return ranked[0]?.reason ?? null;
}

export function compareEarningsMarketImpact(
  a: EarningsMarketImpactScore,
  b: EarningsMarketImpactScore,
  symbolA: string,
  symbolB: string,
): number {
  if (a.total !== b.total) return b.total - a.total;
  return symbolA.localeCompare(symbolB);
}

export function rankEarningsByMarketImpact<T extends EarningsRankable>(
  rows: readonly T[],
  opts: {
    owned: ReadonlySet<string>;
    metadataBySymbol: ReadonlyMap<string, EarningsSymbolMarketMetadata>;
  },
): Array<{ row: T; score: EarningsMarketImpactScore }> {
  return rows
    .map((row) => ({
      row,
      score: scoreEarningsMarketImpact(row, {
        onWatchlist: opts.owned.has(row.symbol),
        metadata: opts.metadataBySymbol.get(row.symbol),
      }),
    }))
    .sort((a, b) =>
      compareEarningsMarketImpact(a.score, b.score, a.row.symbol, b.row.symbol)
    );
}
