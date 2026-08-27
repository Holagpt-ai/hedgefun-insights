import { describe, it, expect } from "vitest";
import {
  canonicalChangePercent,
  currentMoversEmptyMessage,
  etSessionDate,
  mapAfterHoursFeed,
  mapPolygonMovers,
  moverFromExtendedObservation,
  moverFromPolygonTicker,
  moversForAi,
  selectCanonicalCurrentMovers,
  toMoverListRow,
  validateCachedMoverRow,
  validateMover,
  SOURCE_POLYGON,
  SOURCE_MARKET_MOVERS_CACHE,
  type CanonicalMover,
} from "@/lib/markets/movers-integrity";

const NOW = Date.parse("2026-08-27T16:00:00.000Z");
const TODAY = etSessionDate(NOW);

function ticker(overrides: Record<string, unknown> = {}) {
  return {
    ticker: "AAA",
    name: "Example Corp",
    todaysChangePerc: 5,
    todaysChange: 1,
    day: { c: 21, v: 2_000_000, vw: 20.8 },
    prevDay: { c: 20 },
    lastTrade: { p: 21, t: NOW },
    min: { c: 20.9 },
    updated: NOW,
    ...overrides,
  };
}

function baseMover(overrides: Partial<CanonicalMover> = {}): CanonicalMover {
  return {
    valid: true,
    reason: null,
    symbol: "AAA",
    name: "A",
    price: 21,
    reference_price: 20,
    change: 1,
    change_percent: 5,
    volume: 100,
    session: "regular",
    session_date: TODAY,
    source: SOURCE_POLYGON,
    provider_as_of: new Date(NOW).toISOString(),
    id: "a",
    ...overrides,
  };
}

describe("market movers integrity", () => {
  it("accepts a normal positive mover", () => {
    const m = moverFromPolygonTicker(ticker(), "regular", NOW);
    expect(m.valid).toBe(true);
    expect(m.change_percent).toBeCloseTo(5, 5);
    expect(m.price).toBe(21);
  });

  it("accepts a normal negative mover", () => {
    const m = moverFromPolygonTicker(ticker({
      ticker: "BBB",
      todaysChangePerc: -4,
      day: { c: 96, v: 1_000_000 },
      prevDay: { c: 100 },
      lastTrade: { p: 96, t: NOW },
      min: { c: 96.1 },
    }), "regular", NOW);
    expect(m.valid).toBe(true);
    expect(m.change_percent).toBeCloseTo(-4, 5);
  });

  it("keeps a legitimate extreme mover when prices corroborate", () => {
    const m = validateMover({
      symbol: "EXTM",
      name: "Extreme Move Inc",
      price: 8.5,
      referencePrice: 0.1,
      providerPercent: 8400,
      lastTradePrice: 8.5,
      minuteClose: 8.48,
      dayClose: 8.5,
      volume: 50_000_000,
      session: "regular",
      sessionDate: TODAY,
      source: SOURCE_POLYGON,
      providerAsOf: NOW,
      nowMs: NOW,
    });
    expect(m.valid).toBe(true);
    expect(m.change_percent).toBeCloseTo(8400, 5);
  });

  it("rejects a false +8400% caused by percent-versus-ratio conversion", () => {
    const m = validateMover({
      symbol: "OPI",
      price: 8.5,
      referencePrice: 0.1,
      providerPercent: 84,
      lastTradePrice: 8.5,
      minuteClose: 8.5,
      dayClose: 8.5,
      volume: 1_000_000,
      session: "regular",
      sessionDate: TODAY,
      source: SOURCE_POLYGON,
      providerAsOf: NOW,
      nowMs: NOW,
    });
    expect(m.valid).toBe(false);
    expect(m.reason).toBe("percentage_mismatch");
    expect(m.change_percent).toBeNull();
  });

  it("rejects a 100x current/reference decimal-scale mismatch", () => {
    const m = validateMover({
      symbol: "SCAL",
      price: 97.7,
      referencePrice: 0.977,
      lastTradePrice: 97.7,
      dayClose: 97.7,
      session: "regular",
      sessionDate: TODAY,
      source: SOURCE_POLYGON,
      providerAsOf: NOW,
      nowMs: NOW,
    });
    expect(m.valid).toBe(false);
    expect(m.reason).toBe("decimal_scale_mismatch");
  });

  it("rejects contemporaneous 10x snapshot scaling", () => {
    const m = moverFromPolygonTicker(ticker({
      ticker: "MU",
      day: { c: 977, v: 1_000_000 },
      prevDay: { c: 96 },
      lastTrade: { p: 97.7, t: NOW },
      min: { c: 97.65 },
      todaysChangePerc: 900,
    }), "regular", NOW);
    expect(m.valid).toBe(false);
    expect(m.reason).toBe("decimal_scale_mismatch");
  });

  it("rejects an adjusted/unadjusted reference mismatch", () => {
    const m = validateMover({
      symbol: "SPLT",
      price: 12,
      referencePrice: 11,
      lastTradePrice: 12,
      dayClose: 12,
      adjustedClose: 12,
      unadjustedClose: 120,
      session: "regular",
      sessionDate: TODAY,
      source: SOURCE_POLYGON,
      nowMs: NOW,
    });
    expect(m.valid).toBe(false);
    expect(m.reason).toBe("adjustment_mismatch");
  });

  it("rejects a missing previous close as unverified", () => {
    const missing = validateMover({
      symbol: "NOPR",
      price: 10,
      lastTradePrice: 10,
      dayClose: 10,
      session: "regular",
      nowMs: NOW,
    });
    expect(missing.valid).toBe(false);
    expect(missing.reason).toBe("missing_corroboration");
  });

  it("rejects a zero previous close", () => {
    const zero = validateMover({
      symbol: "ZERO",
      price: 10,
      referencePrice: 0,
      lastTradePrice: 10,
      dayClose: 10,
      session: "regular",
      nowMs: NOW,
    });
    expect(zero.valid).toBe(false);
    expect(zero.reason).toBe("invalid_reference_price");
  });

  it("rejects a stale cached reference", () => {
    const m = validateMover({
      symbol: "OLD",
      price: 10,
      referencePrice: 9,
      lastTradePrice: 10,
      dayClose: 10,
      session: "regular",
      sessionDate: "2026-08-20",
      source: SOURCE_MARKET_MOVERS_CACHE,
      providerAsOf: "2026-08-20T14:00:00.000Z",
      nowMs: NOW,
    });
    expect(m.valid).toBe(false);
    expect(m.reason).toBe("stale_reference");
  });

  it("rejects mixing a regular-session close with an extended-hours percent", () => {
    const m = moverFromPolygonTicker(ticker({
      ticker: "MIXD",
      todaysChangePerc: 50,
      day: { c: 10, v: 1_000_000 },
      prevDay: { c: 10 },
      lastTrade: { p: 15, t: NOW },
      min: { c: 15 },
    }), "regular", NOW);
    expect(m.valid).toBe(false);
    expect(m.reason).toBe("session_mismatch");
  });

  it("deduplicates the same symbol/session and keeps a deterministic winner", () => {
    const older = baseMover({
      id: "old",
      volume: 9_000_000,
      provider_as_of: "2026-08-27T14:00:00.000Z",
    });
    const newer = baseMover({
      id: "new",
      volume: 1_000_000,
      provider_as_of: "2026-08-27T15:00:00.000Z",
    });
    const invalid = baseMover({
      id: "bad",
      valid: false,
      reason: "invalid_current_price",
      price: null,
      provider_as_of: "2026-08-27T16:00:00.000Z",
    });
    const winners = selectCanonicalCurrentMovers([older, newer, invalid], { sessionDate: TODAY });
    expect(winners).toHaveLength(1);
    expect(winners[0].id).toBe("new");
  });

  it("breaks remaining ties by higher volume then stable id", () => {
    const a = baseMover({ id: "a-id", volume: 500, provider_as_of: "2026-08-27T15:00:00.000Z" });
    const b = baseMover({ id: "b-id", volume: 800, provider_as_of: "2026-08-27T15:00:00.000Z" });
    const winners = selectCanonicalCurrentMovers([a, b], { sessionDate: TODAY });
    expect(winners[0].id).toBe("b-id");
  });

  it("keeps the same symbol across different historical session dates", () => {
    const today = baseMover({ id: "today", session_date: TODAY });
    const yesterday = baseMover({
      id: "yesterday",
      session_date: "2026-08-26",
      provider_as_of: "2026-08-26T20:00:00.000Z",
    });
    const all = selectCanonicalCurrentMovers([today, yesterday]);
    expect(all.map((r) => r.id).sort()).toEqual(["today", "yesterday"]);
    const currentOnly = selectCanonicalCurrentMovers([today, yesterday], { sessionDate: TODAY });
    expect(currentOnly.map((r) => r.id)).toEqual(["today"]);
  });

  it("excludes invalid rows from AI evidence", () => {
    const good = moverFromPolygonTicker(ticker(), "regular", NOW);
    const bad = validateMover({
      symbol: "OPI",
      price: 8.5,
      referencePrice: 0.1,
      providerPercent: 84,
      lastTradePrice: 8.5,
      dayClose: 8.5,
      nowMs: NOW,
    });
    const ai = moversForAi([good, bad]);
    expect(ai.map((r) => r.symbol)).toEqual(["AAA"]);
  });

  it("does not treat cached table rows without a reference as verified", () => {
    const cached = validateCachedMoverRow({
      id: "c1",
      symbol: "OPI",
      name: "Office Properties",
      price: 0.28,
      change_percent: 8400,
      volume: 12_000_000,
      type: "gainer",
      session_date: TODAY,
      updated_at: new Date(NOW).toISOString(),
    }, NOW);
    expect(cached.valid).toBe(false);
    expect(cached.reason).toBe("missing_corroboration");
  });

  it("preserves volume-first ordering for most-active lists", () => {
    const low = moverFromPolygonTicker(ticker({
      ticker: "LOWV",
      day: { c: 11, v: 100_000 },
      prevDay: { c: 10 },
      lastTrade: { p: 11, t: NOW },
      min: { c: 11 },
      todaysChangePerc: 10,
    }), "regular", NOW);
    const high = moverFromPolygonTicker(ticker({
      ticker: "HIV",
      day: { c: 12, v: 9_000_000 },
      prevDay: { c: 10 },
      lastTrade: { p: 12, t: NOW },
      min: { c: 12 },
      todaysChangePerc: 20,
    }), "regular", NOW);
    const ordered = selectCanonicalCurrentMovers([low, high], {
      sessionDate: TODAY,
      sort: "volume_desc",
    });
    expect(ordered.map((r) => r.symbol)).toEqual(["HIV", "LOWV"]);
  });

  it("maps a polygon payload into a canonical list without duplicates", () => {
    const { rows, rejected } = mapPolygonMovers([
      ticker({ ticker: "DUP", day: { c: 21, v: 1 }, prevDay: { c: 20 }, lastTrade: { p: 21, t: NOW }, min: { c: 21 } }),
      ticker({ ticker: "DUP", day: { c: 21, v: 5 }, prevDay: { c: 20 }, lastTrade: { p: 21, t: NOW + 1000 }, min: { c: 21 }, updated: NOW + 1000 }),
      ticker({ ticker: "BAD", day: { c: 977, v: 1 }, prevDay: { c: 96 }, lastTrade: { p: 97.7, t: NOW }, min: { c: 97.7 }, todaysChangePerc: 900 }),
    ], "regular", { nowMs: NOW });
    expect(rows.map((r) => r.symbol)).toEqual(["DUP"]);
    expect(rows[0].changePercent).toBeCloseTo(5, 5);
    expect(rejected).toBeGreaterThanOrEqual(1);
  });

  it("exports canonical percent math", () => {
    expect(canonicalChangePercent(21, 20)).toBeCloseTo(5, 8);
    expect(toMoverListRow(baseMover({ valid: false, reason: "invalid_current_price" }))).toBeNull();
  });

  it("keeps a corroborated 5x after-hours move and does not treat regular close as contemporaneous", () => {
    const m = moverFromExtendedObservation({
      symbol: "AHX",
      name: "After Hours Extreme",
      extendedLast: 50,
      regularClose: 10,
      volume: 2_000_000,
      providerAsOf: NOW,
      changePercent: 400,
    }, NOW);
    expect(m.valid).toBe(true);
    expect(m.session).toBe("afterhours");
    expect(m.change_percent).toBeCloseTo(400, 5);
  });

  it("deduplicates after-hours feed rows and drops unverified extremes", () => {
    const rows = mapAfterHoursFeed([
      {
        symbol: "AH1",
        company_name: "One",
        extended_last: 11,
        regular_close: 10,
        change_percent: 10,
        volume: 100,
        provider_as_of: new Date(NOW).toISOString(),
        id: "old",
      },
      {
        symbol: "AH1",
        company_name: "One",
        extended_last: 11,
        regular_close: 10,
        change_percent: 10,
        volume: 900,
        provider_as_of: new Date(NOW + 1000).toISOString(),
        id: "new",
      },
      {
        symbol: "BAD",
        company_name: "Bad",
        extended_last: 8.5,
        regular_close: 0.1,
        change_percent: 84,
        volume: 50,
        provider_as_of: new Date(NOW).toISOString(),
      },
    ], { nowMs: NOW, sort: "percent_desc" });
    expect(rows.map((r) => r.symbol)).toEqual(["AH1"]);
    expect(rows[0].changePercent).toBeCloseTo(10, 5);
    expect(rows[0].volume).toBe(900);
  });

  it("uses honest unavailable copy instead of a loading lie", () => {
    expect(currentMoversEmptyMessage({ hasSearchQuery: false, marketClosed: false }))
      .toBe("Market movers are currently unavailable.");
    expect(currentMoversEmptyMessage({ hasSearchQuery: true, marketClosed: false }))
      .toBe("No results match your search.");
    expect(currentMoversEmptyMessage({ hasSearchQuery: false, marketClosed: true }))
      .toContain("currently closed");
  });
});
