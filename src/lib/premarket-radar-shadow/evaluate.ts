import {
  EVENT_TYPE_LABEL,
} from "@/lib/catalyst/parsers";
import type { CatalystEvent, CatalystEventType } from "@/types/catalyst";
import { selectEnrichmentEntries } from "@/lib/catalyst/enrichment";
import { selectAmVolumeLeaders } from "@/lib/radar-am-shadow/select";
import { classifyLifecycle, hodDistancePct } from "./lifecycle";
import { isoFromMs, normalizeSymbol } from "./numbers";
import {
  comparePrices,
  qualityFlags,
  snapshotProviderMs,
} from "./price";
import {
  productionExclusion,
  qualifyDayTradeRadar,
  qualifyPremarketShadow,
} from "./qualify";
import {
  PREMARKET_SHADOW_TOP_N,
  LIFECYCLE_RULE,
  type EvaluateInput,
  type FieldDivergenceSummary,
  type PersistedScreenerRow,
  type PremarketShadowReport,
  type ProductionRow,
  type ShadowCandidate,
  type ShadowCatalyst,
  type SnapshotTicker,
} from "./types";
import {
  compareVolumeAtCapture,
  filterPremarketBars,
  windowHigh,
} from "./volume";

function emptyCatalyst(): ShadowCatalyst {
  return {
    present: false,
    eventType: null,
    title: null,
    source: null,
    publishedAt: null,
    ageMs: null,
  };
}

function attachCatalyst(
  events: readonly CatalystEvent[],
  symbol: string,
  nowMs: number,
): ShadowCatalyst {
  const map = selectEnrichmentEntries(events, [symbol], nowMs);
  const entry = map.get(symbol);
  if (!entry) return emptyCatalyst();
  const published = entry.event.published_at ?? entry.event.event_time;
  const publishedMs = published ? Date.parse(published) : NaN;
  const type = entry.event.event_type;
  const typeLabel =
    type in EVENT_TYPE_LABEL ? EVENT_TYPE_LABEL[type as CatalystEventType] : type;
  return {
    present: true,
    eventType: typeLabel,
    title: entry.event.title,
    source: entry.event.source_name,
    publishedAt: published ?? null,
    ageMs: Number.isFinite(publishedMs) ? nowMs - publishedMs : null,
  };
}

export function compareShadowRank(
  a: { cumulativeVolume: number | null; cumulativeDollarVolume: number | null; symbol: string },
  b: { cumulativeVolume: number | null; cumulativeDollarVolume: number | null; symbol: string },
): number {
  const av = a.cumulativeVolume;
  const bv = b.cumulativeVolume;
  if (av === null && bv === null) {
    const ad = a.cumulativeDollarVolume ?? 0;
    const bd = b.cumulativeDollarVolume ?? 0;
    if (bd !== ad) return bd - ad;
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  }
  if (av === null) return 1;
  if (bv === null) return -1;
  if (bv !== av) return bv - av;
  const ad = a.cumulativeDollarVolume ?? 0;
  const bd = b.cumulativeDollarVolume ?? 0;
  if (bd !== ad) return bd - ad;
  return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
}

function persistedTop3(
  rows: PersistedScreenerRow[] | null,
  nowMs: number,
): { status: "available" | "empty" | "stale" | "unavailable"; top: ProductionRow[] } {
  if (rows === null) return { status: "unavailable", top: [] };
  const selected = selectAmVolumeLeaders(rows, nowMs, 6);
  const top = selected.rows.slice(0, PREMARKET_SHADOW_TOP_N).map((r, i) => ({
    rank: i + 1,
    symbol: r.symbol,
    price: r.price,
    changePct: r.change_percent,
    volume: r.volume,
  }));
  if (top.length === 0) return { status: "empty", top };
  return { status: selected.status, top };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function summarizeFields(rows: ShadowCandidate[]): FieldDivergenceSummary {
  let dayCNearPrevCloseCount = 0;
  let lastTradeMoveGe10Count = 0;
  let minMoveGe10Count = 0;
  let dayVMuchLargerThanBarCount = 0;
  const ratios: number[] = [];
  for (const r of rows) {
    const dayMove = r.priceComp.daySessionMovePct;
    if (dayMove !== null && Math.abs(dayMove) < 0.5) dayCNearPrevCloseCount += 1;
    if (r.priceComp.lastTradeMovePct !== null && r.priceComp.lastTradeMovePct >= 10) {
      lastTradeMoveGe10Count += 1;
    }
    if (r.priceComp.minCloseMovePct !== null && r.priceComp.minCloseMovePct >= 10) {
      minMoveGe10Count += 1;
    }
    if (r.volumeComp.dayVOverBar !== null) {
      ratios.push(r.volumeComp.dayVOverBar);
      if (r.volumeComp.dayVOverBar >= 3) dayVMuchLargerThanBarCount += 1;
    }
  }
  return {
    sampleSize: rows.length,
    dayCNearPrevCloseCount,
    lastTradeMoveGe10Count,
    minMoveGe10Count,
    dayVMuchLargerThanBarCount,
    medianDayVOverBar: median(ratios),
  };
}

function buildCandidate(
  t: SnapshotTicker,
  symbol: string,
  input: EvaluateInput,
): ShadowCandidate {
  const rawBars = input.barsBySymbol.get(symbol) ?? [];
  const bars = filterPremarketBars(rawBars, input.window);
  const priceComp = comparePrices(t);
  const volumeComp = compareVolumeAtCapture(t, bars, input.window.captureMs);
  const providerMs = snapshotProviderMs(t);
  const hod = windowHigh(bars);
  const dist = hodDistancePct(priceComp.extendedPrice, hod);
  const missingRequired =
    priceComp.extendedPrice === null ||
    priceComp.prevClose === null ||
    volumeComp.barCumulative === null;
  return {
    symbol,
    rank: 0,
    price: priceComp.extendedPrice,
    priceSource: priceComp.extendedPriceSource,
    changePct: priceComp.extendedMovePct,
    cumulativeVolume: volumeComp.barCumulative,
    cumulativeDollarVolume: volumeComp.barDollarVolume,
    timestampIso: isoFromMs(input.window.captureMs),
    providerTimestampIso: isoFromMs(providerMs),
    qualityFlags: qualityFlags({
      nowMs: input.window.captureMs,
      providerMs,
      priceComp,
      missingRequired,
    }),
    lifecycle: classifyLifecycle(volumeComp, dist),
    hod,
    hodDistancePct: dist,
    priceComp,
    volumeComp,
    catalyst: attachCatalyst(input.catalysts, symbol, input.window.captureMs),
  };
}

export function evaluatePremarketShadow(input: EvaluateInput): PremarketShadowReport {
  const bySymbol = new Map<string, SnapshotTicker>();
  for (const t of input.tickers) {
    const sym = normalizeSymbol(t.ticker);
    if (!sym) continue;
    bySymbol.set(sym, { ...t, ticker: sym });
  }

  const shadowSymbols =
    input.barsBySymbol.size > 0
      ? [...input.barsBySymbol.keys()]
      : [...bySymbol.keys()];

  const allCandidates: ShadowCandidate[] = [];
  for (const symbol of shadowSymbols) {
    const t = bySymbol.get(symbol);
    if (!t) continue;
    allCandidates.push(buildCandidate(t, symbol, input));
  }
  allCandidates.sort(compareShadowRank);
  allCandidates.forEach((c, i) => {
    c.rank = i + 1;
  });

  const shadowWithVolume = allCandidates.filter(
    (c) => c.cumulativeVolume !== null && c.cumulativeVolume > 0,
  );

  const shadowQualified = shadowWithVolume.filter((c) => {
    const t = bySymbol.get(c.symbol);
    if (!t) return false;
    return qualifyPremarketShadow({
      ticker: t,
      priceComp: c.priceComp,
      volumeComp: c.volumeComp,
    }).ok;
  });

  const dtrQualified: ProductionRow[] = [...bySymbol.values()]
    .map((t) => ({ t, q: qualifyDayTradeRadar(t) }))
    .filter((row) => row.q.ok)
    .sort((a, b) => {
      const av = typeof a.t.day?.v === "number" ? a.t.day.v : -1;
      const bv = typeof b.t.day?.v === "number" ? b.t.day.v : -1;
      if (bv !== av) return bv - av;
      const sa = String(a.t.ticker);
      const sb = String(b.t.ticker);
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    })
    .slice(0, PREMARKET_SHADOW_TOP_N)
    .map((row, i) => ({
      rank: i + 1,
      symbol: String(row.t.ticker),
      price: row.q.price,
      changePct: row.q.movePct,
      volume: typeof row.t.day?.v === "number" ? row.t.day.v : null,
    }));

  const dtrSymbols = new Set(
    [...bySymbol.values()]
      .filter((t) => qualifyDayTradeRadar(t).ok)
      .map((t) => String(t.ticker)),
  );
  const productionExclusions = shadowQualified
    .filter((c) => !dtrSymbols.has(c.symbol))
    .map((c) => {
      const t = bySymbol.get(c.symbol)!;
      return productionExclusion(c.symbol, qualifyDayTradeRadar(t), c.priceComp);
    });

  const persisted = persistedTop3(input.persistedScreener, input.nowMs);
  const notes: string[] = [];
  if (input.persistedScreenerError) {
    notes.push(`persisted_screener_error=${input.persistedScreenerError}`);
  }
  notes.push(`calendar_source=${input.window.calendarSource}`);
  notes.push(`lifecycle_rule=${LIFECYCLE_RULE}`);
  notes.push("Catalyst is joined read-only and does not affect rank.");
  notes.push("5/15/30/60-minute windows are measured only; they do not override cumulative ranking.");

  const rankedWithVolume = shadowWithVolume.map((c, i) => ({ ...c, rank: i + 1 }));
  const rankedQualified = shadowQualified.map((c, i) => ({ ...c, rank: i + 1 }));

  return {
    status: "captured",
    gate: { ok: true, window: input.window },
    evaluatedAtIso: new Date(input.nowMs).toISOString(),
    productionPersistedTop3: persisted.top,
    productionPersistedStatus: persisted.status,
    productionLiveDtrTop3: dtrQualified,
    shadowTop: rankedWithVolume.slice(0, Math.max(PREMARKET_SHADOW_TOP_N, 10)),
    shadowQualifiedTop: rankedQualified.slice(0, Math.max(PREMARKET_SHADOW_TOP_N, 10)),
    productionExclusions,
    ratioOnlyExclusions: productionExclusions
      .filter((e) => e.lostToPriorSessionRatioOnly)
      .map((e) => e.symbol),
    missingData: allCandidates.filter((c) => c.qualityFlags.includes("missing")),
    fieldDivergence: summarizeFields(rankedWithVolume),
    lifecycleRule: LIFECYCLE_RULE,
    notes,
  };
}

export function notApplicableReport(
  gate: Extract<PremarketShadowReport["gate"], { ok: false }>,
  nowMs: number,
): PremarketShadowReport {
  return {
    status: "not_applicable",
    gate,
    evaluatedAtIso: new Date(nowMs).toISOString(),
    productionPersistedTop3: [],
    productionPersistedStatus: "unavailable",
    productionLiveDtrTop3: [],
    shadowTop: [],
    shadowQualifiedTop: [],
    productionExclusions: [],
    ratioOnlyExclusions: [],
    missingData: [],
    fieldDivergence: null,
    lifecycleRule: LIFECYCLE_RULE,
    notes: [gate.detail, gate.nextCaptureHint],
  };
}

export function selectBarFetchUniverse(
  tickers: SnapshotTicker[],
  limit: number,
): string[] {
  const scored: { symbol: string; score: number; dtr: boolean }[] = [];
  const seen = new Set<string>();
  for (const t of tickers) {
    const symbol = normalizeSymbol(t.ticker);
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    const dtr = qualifyDayTradeRadar(t).ok;
    const dayV = t.day?.v;
    const minAv = t.min?.av;
    const minV = t.min?.v;
    const score = Math.max(
      typeof dayV === "number" && Number.isFinite(dayV) ? dayV : 0,
      typeof minAv === "number" && Number.isFinite(minAv) ? minAv : 0,
      typeof minV === "number" && Number.isFinite(minV) ? minV : 0,
    );
    scored.push({ symbol, score, dtr });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
  const top = scored.slice(0, Math.max(0, limit)).map((s) => s.symbol);
  const extra = scored.filter((s) => s.dtr && !top.includes(s.symbol)).map((s) => s.symbol);
  return [...top, ...extra];
}

