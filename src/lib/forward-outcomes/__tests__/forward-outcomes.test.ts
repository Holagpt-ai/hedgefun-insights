import { describe, expect, it } from "vitest";
import { attachForwardOutcomesFromStore } from "@/lib/forward-outcomes/attach-forward-outcomes-to-comparables";
import { computeForwardOutcomesForEpisode } from "@/lib/forward-outcomes/compute-forward-outcome";
import {
  closePositionFromOhlc,
  pctChange,
} from "@/lib/forward-outcomes/forward-outcome-formulas";
import {
  forwardOutcomeRowKey,
  generateForwardOutcomes,
} from "@/lib/forward-outcomes/generate-forward-outcomes";
import { forwardOutcomeRowToJson } from "@/lib/forward-outcomes/forward-outcome-record";
import type { PersistedForwardOutcomeRow } from "@/lib/forward-outcomes/forward-outcome-types";
import { resolveHorizonSessionFromHistory } from "@/lib/forward-outcomes/trading-session-horizons";
import type { RepeatMoverComparableEpisode } from "@/types/repeat-mover";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";

function daily(sessionDate: string, close: number, overrides: Partial<SecurityDailyHistory> = {}): SecurityDailyHistory {
  return {
    securityId: SECURITY_ID,
    sessionDate,
    observedSymbol: "TEST",
    exchange: "XNAS",
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000_000,
    dollarVolume: close * 1_000_000,
    previousClose: close - 0.25,
    movePct: 1,
    source: null,
    sourceAsOf: null,
    fetchedAt: null,
    computedAt: null,
    quality: "DERIVED",
    freshness: "FRESH",
    provenance: "DERIVED",
    ...overrides,
  };
}

function episode(episodeId: string, sessionStart: string, endPrice: number): MarketBehaviorEpisode {
  return {
    episodeId,
    securityId: SECURITY_ID,
    episodeStart: `${sessionStart}T20:00:00.000Z`,
    episodeEnd: `${sessionStart}T21:00:00.000Z`,
    observedSymbol: "TEST",
    direction: "POSITIVE",
    tier: "NOTABLE",
    startPrice: endPrice - 2,
    highPrice: endPrice + 1,
    lowPrice: endPrice - 3,
    endPrice,
    maxPositiveMovePct: 5,
    maxNegativeMovePct: -1,
    volume: 2_000_000,
    dollarVolume: endPrice * 2_000_000,
    rvol: 2,
    floatTurnover: null,
    haltCount: 0,
    closeStrength: null,
    detectedBy: null,
    origin: "HISTORICAL_BACKFILL",
    createdAt: `${sessionStart}T21:00:00.000Z`,
    updatedAt: `${sessionStart}T21:00:00.000Z`,
    source: null,
    sourceAsOf: null,
    fetchedAt: null,
    computedAt: null,
    quality: "DERIVED",
    freshness: "FRESH",
    provenance: "DERIVED",
  };
}

describe("forward outcome formulas", () => {
  it("returns null when denominator is zero", () => {
    expect(pctChange(0, 10)).toBeNull();
  });

  it("preserves valid zero percent return", () => {
    expect(pctChange(100, 100)).toBe(0);
  });

  it("computes close position", () => {
    expect(closePositionFromOhlc({ high: 110, low: 100, close: 105 })).toBeCloseTo(0.5);
    expect(closePositionFromOhlc({ high: 100, low: 100, close: 100 })).toBeNull();
  });
});

describe("trading session horizons", () => {
  const sorted = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-08"];
  const dailyByDate = new Map(sorted.map((d) => [d, { sessionDate: d }]));

  it("skips weekend for +1 session", () => {
    const resolved = resolveHorizonSessionFromHistory({
      episodeSessionDate: "2024-01-05",
      tradingSessionsAfter: 1,
      sortedSessionDates: sorted,
      dailyByDate,
    });
    expect(resolved.availabilityState).toBe("AVAILABLE");
    expect(resolved.horizonSessionDate).toBe("2024-01-08");
  });

  it("marks future session not loaded", () => {
    const resolved = resolveHorizonSessionFromHistory({
      episodeSessionDate: "2024-01-08",
      tradingSessionsAfter: 1,
      sortedSessionDates: sorted,
      dailyByDate,
    });
    expect(resolved.availabilityState).toBe("FUTURE_SESSION_NOT_LOADED");
  });
});

describe("computeForwardOutcomesForEpisode", () => {
  const history = [
    daily("2024-06-03", 100),
    daily("2024-06-04", 102, { open: 101, high: 103, low: 100.5, previousClose: 100 }),
    daily("2024-06-05", 98, { open: 102, high: 102.5, low: 97, previousClose: 102 }),
    daily("2024-06-06", 99),
    daily("2024-06-07", 101),
    daily("2024-06-10", 104),
  ];
  const sortedSessionDates = history.map((row) => row.sessionDate);
  const dailyByDate = new Map(history.map((row) => [row.sessionDate, row]));
  const ep = episode("22222222-2222-4222-8222-222222222222", "2024-06-03", 100);

  it("computes D1 through D5 with gap and excursions", () => {
    const rows = computeForwardOutcomesForEpisode({
      episode: ep,
      episodeSessionDate: "2024-06-03",
      episodeDaily: history[0]!,
      sortedSessionDates,
      dailyByDate,
    });
    const d1 = rows.find((row) => row.horizon === "D1")!;
    expect(d1.availabilityState).toBe("AVAILABLE");
    expect(d1.returnPct).toBeCloseTo(2);
    expect(d1.gapPct).toBeCloseTo(((101 - 100) / 100) * 100);
    expect(d1.maxGainPct).toBeCloseTo(((103 - 100) / 100) * 100);
    expect(d1.maxDrawdownPct).toBeCloseTo(((100.5 - 100) / 100) * 100);
    expect(d1.exceededEpisodeHigh).toBe(true);
    expect(d1.closedAboveEpisodeClose).toBe(true);

    const d5 = rows.find((row) => row.horizon === "D5")!;
    expect(d5.availabilityState).toBe("AVAILABLE");
    expect(d5.horizonSessionDate).toBe("2024-06-10");
  });

  it("uses null OHLC safely for unavailable horizon", () => {
    const shortHistory = history.slice(0, 2);
    const shortDates = shortHistory.map((row) => row.sessionDate);
    const shortMap = new Map(shortHistory.map((row) => [row.sessionDate, row]));
    const rows = computeForwardOutcomesForEpisode({
      episode: ep,
      episodeSessionDate: "2024-06-03",
      episodeDaily: shortHistory[0]!,
      sortedSessionDates: shortDates,
      dailyByDate: shortMap,
    });
    const d5 = rows.find((row) => row.horizon === "D5")!;
    expect(d5.dataAvailable).toBe(false);
    expect(d5.returnPct).toBeNull();
    expect(d5.availabilityState).toBe("FUTURE_SESSION_NOT_LOADED");
  });
});

describe("generateForwardOutcomes idempotency", () => {
  const history = [daily("2024-07-01", 50), daily("2024-07-02", 51)];
  const episodes = [episode("33333333-3333-4333-8333-333333333333", "2024-07-01", 50)];

  it("skips existing keys and prevents duplicate generation", () => {
    const existing = new Set([forwardOutcomeRowKey(episodes[0]!.episodeId, "D1")]);
    const first = generateForwardOutcomes({
      securityId: SECURITY_ID,
      dailyHistory: history,
      episodes,
      existingKeys: existing,
    });
    expect(first.rows.some((row) => row.horizonKey === "D1")).toBe(false);
    expect(first.skippedExisting).toBeGreaterThan(0);

    const second = generateForwardOutcomes({
      securityId: SECURITY_ID,
      dailyHistory: history,
      episodes,
      existingKeys: new Set(),
    });
    const keys = new Set(second.rows.map((row) => forwardOutcomeRowKey(row.episodeId, row.horizonKey)));
    expect(keys.size).toBe(second.rows.length);
  });
});

describe("Repeat Movers attachment", () => {
  const comparable: RepeatMoverComparableEpisode = {
    episodeId: "44444444-4444-4444-8444-444444444444",
    sessionDate: "2024-08-01",
    tier: "NOTABLE",
    direction: "POSITIVE",
    movePct: 4,
    volume: 1,
    rvol: 2,
    dollarVolume: 3,
    closePosition: 0.8,
    nextSessionMovePct: null,
    nextSessionContinuation: null,
    similarity: { sameDirection: true, sameTier: true, movePctDelta: 1 },
  };

  const persisted: PersistedForwardOutcomeRow[] = [
    {
      episodeId: comparable.episodeId,
      securityId: SECURITY_ID,
      horizonKey: "D1",
      horizon: "D1",
      availabilityState: "AVAILABLE",
      dataAvailable: true,
      episodeSessionDate: "2024-08-01",
      horizonSessionDate: "2024-08-02",
      referencePrice: 10,
      referenceTimestamp: null,
      outcomePrice: 10.5,
      returnPct: 5,
      openToCloseReturnPct: 1,
      gapPct: 0.5,
      maxGainPct: 6,
      maxDrawdownPct: -1,
      highPrice: 10.6,
      lowPrice: 9.9,
      sessionVolume: 100,
      rvol: null,
      horizonSessionMovePct: 5,
      closePosition: 0.7,
      closedAboveEpisodeClose: true,
      closedBelowEpisodeClose: false,
      exceededEpisodeHigh: false,
      brokeEpisodeLow: false,
    },
  ];

  it("attaches observed facts without predictive fields", () => {
    const [attached] = attachForwardOutcomesFromStore([comparable], persisted);
    expect(attached.observedForwardOutcomes?.closeToCloseReturnPct.D1).toBe(5);
    expect(attached.nextSessionContinuation).toBe(true);
    const json = JSON.stringify(attached.observedForwardOutcomes).toLowerCase();
    expect(json).not.toContain("probability");
    expect(json).not.toContain("confidence");
    expect(json).not.toContain("bullish");
  });

  it("preserves securityId on persisted row mapping", () => {
    const json = forwardOutcomeRowToJson(persisted[0]!, new Date().toISOString());
    expect(json.security_id).toBe(SECURITY_ID);
  });
});

describe("negative episode forward return", () => {
  it("computes negative close-to-close return", () => {
    const history = [
      daily("2024-09-03", 20),
      daily("2024-09-04", 18),
    ];
    const ep = episode("55555555-5555-4555-8555-555555555555", "2024-09-03", 20);
    ep.direction = "NEGATIVE";
    const rows = computeForwardOutcomesForEpisode({
      episode: ep,
      episodeSessionDate: "2024-09-03",
      episodeDaily: history[0]!,
      sortedSessionDates: history.map((row) => row.sessionDate),
      dailyByDate: new Map(history.map((row) => [row.sessionDate, row])),
    });
    expect(rows.find((row) => row.horizon === "D1")?.returnPct).toBeCloseTo(-10);
  });
});
