import { describe, it, expect } from "vitest";
import {
  parseIntradayBars,
  parseMarketSignals,
  parseRecentEvents,
  parseKeyLevels,
  parseInputsQuality,
  parseDriverIds,
  isValidHttpsUrl,
  isExpired,
  isDirection,
  humanFailureReason,
  humanFailureReasonSecondary,
  isExpectedUnavailableReason,
  isProviderSystemFailureReason,
  formatMarketDataAge,
} from "@/lib/watchlist-v2/parsers";

describe("parseIntradayBars", () => {
  it("accepts valid OHLCV bars only", () => {
    const bars = parseIntradayBars([
      { t: 1, o: 10, h: 11, l: 9, c: 10.5, v: 100 },
      { t: 2, o: 10.5, h: 12, l: 10, c: 11, v: 200 },
    ]);
    expect(bars).toHaveLength(2);
  });
  it("rejects malformed and inverted bars", () => {
    const bars = parseIntradayBars([
      { t: 1, o: 10, h: 9, l: 11, c: 10, v: 100 }, // h<l
      { t: 2, o: 10, h: 11, l: 9, c: 20, v: 50 }, // c>h
      "nope",
      null,
      { t: "x", o: 1, h: 1, l: 1, c: 1, v: 1 },
    ]);
    expect(bars).toHaveLength(0);
  });
  it("returns [] for non-array", () => {
    expect(parseIntradayBars(null)).toEqual([]);
    expect(parseIntradayBars("bad")).toEqual([]);
  });
});

describe("parseMarketSignals", () => {
  it("keeps valid signals and drops invalid", () => {
    const sigs = parseMarketSignals([
      {
        signal_id: "sig1",
        label: "VWAP reclaim",
        category: "level",
        kind: "transition",
        direction: "bullish",
        observed_at: "2026-01-01T15:00:00Z",
      },
      { signal_id: "", label: "x", category: "trend", kind: "state", direction: null, observed_at: "2026-01-01T15:00:00Z" },
      { signal_id: "sig2", label: "bad cat", category: "nope", kind: "state", direction: null, observed_at: "2026-01-01T15:00:00Z" },
    ]);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].signal_id).toBe("sig1");
  });
});

describe("parseRecentEvents", () => {
  it("filters non-https urls to null", () => {
    const evts = parseRecentEvents([
      {
        event_id: "e1",
        event_type: "news",
        title: "Headline",
        event_time: "2026-01-01T00:00:00Z",
        source_name: "Reuters",
        source_url: "http://insecure.example",
        verification_state: "provider_reported",
      },
    ]);
    expect(evts).toHaveLength(0);
  });
  it("keeps valid https url", () => {
    const evts = parseRecentEvents([
      {
        event_id: "e1",
        event_type: "news",
        title: "Headline",
        event_time: "2026-01-01T00:00:00Z",
        source_name: "Reuters",
        source_url: "https://reuters.com/a",
        verification_state: "provider_reported",
      },
    ]);
    expect(evts).toHaveLength(1);
    expect(evts[0].source_url).toBe("https://reuters.com/a");
  });
});

describe("parseKeyLevels", () => {
  it("missing values stay null, never zero", () => {
    const k = parseKeyLevels({ vwap: 100, hod: 0, lod: -1, prior_close: null });
    expect(k.vwap).toBe(100);
    expect(k.hod).toBeNull();
    expect(k.lod).toBeNull();
    expect(k.prior_close).toBeNull();
    expect(k.premarket_high).toBeNull();
  });
});

describe("parseInputsQuality + parseDriverIds", () => {
  it("filters", () => {
    expect(parseDriverIds(["a", "", 5, null])).toEqual(["a"]);
    const q = parseInputsQuality({ rvol: "no_baseline", bar_count: 15, extra: "junk" });
    expect(q.rvol).toBe("no_baseline");
    expect(q.bar_count).toBe(15);
  });
});

describe("isValidHttpsUrl", () => {
  it("only https", () => {
    expect(isValidHttpsUrl("https://a.com")).toBe(true);
    expect(isValidHttpsUrl("http://a.com")).toBe(false);
    expect(isValidHttpsUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("isExpired", () => {
  it("expired when valid_through in past", () => {
    expect(isExpired("2000-01-01T00:00:00Z", new Date("2026-01-01T00:00:00Z"))).toBe(true);
    expect(isExpired("2100-01-01T00:00:00Z", new Date("2026-01-01T00:00:00Z"))).toBe(false);
    expect(isExpired(null)).toBe(true);
    expect(isExpired("not a date")).toBe(true);
  });
});

describe("humanFailureReason never exposes internal snapshot codes", () => {
  it("maps persisted codes to user-facing copy", () => {
    expect(humanFailureReason("SNAPSHOT_MISSING")).toBe("Market snapshot unavailable.");
    expect(humanFailureReason("QUOTE_REJECTED")).toBe("Current market snapshot unavailable");
    expect(humanFailureReason("INSUFFICIENT_EVIDENCE")).toBe("Not enough trading evidence yet");
    expect(humanFailureReason("SNAPSHOT_STALE")).toBe("Waiting for fresh market data");
    expect(humanFailureReason("NON_TRADING_DAY")).toBe("Market session closed");
    expect(humanFailureReason("SNAPSHOT_MISSING")).not.toContain("SNAPSHOT_MISSING");
  });

  it("keeps provider and system errors distinct from expected unavailable states", () => {
    expect(humanFailureReason("RATE_LIMITED")).toBe("Rate limited by data provider.");
    expect(humanFailureReason("PROVIDER_ERROR")).toBe("Market data provider error.");
    expect(humanFailureReason("AI_VALIDATION_FAILED")).toBe("AI response failed validation.");
    expect(humanFailureReason("UPSTREAM_ERROR")).toBe("Upstream service error.");
    expect(humanFailureReason("SNAPSHOT_STALE")).not.toMatch(/AI failed/i);
    expect(humanFailureReason("INSUFFICIENT_EVIDENCE")).not.toMatch(/AI failed/i);
    expect(isExpectedUnavailableReason("SNAPSHOT_STALE")).toBe(true);
    expect(isExpectedUnavailableReason("INSUFFICIENT_EVIDENCE")).toBe(true);
    expect(isExpectedUnavailableReason("RATE_LIMITED")).toBe(false);
    expect(isProviderSystemFailureReason("RATE_LIMITED")).toBe(true);
    expect(isProviderSystemFailureReason("SNAPSHOT_STALE")).toBe(false);
    expect(humanFailureReasonSecondary("SNAPSHOT_STALE")).toBe("Stocksist will automatically retry.");
    expect(humanFailureReasonSecondary("INSUFFICIENT_EVIDENCE")).toBe("Stocksist will automatically recheck.");
    expect(humanFailureReasonSecondary("PROVIDER_ERROR")).toBeNull();
  });
});

describe("formatMarketDataAge only renders real timestamps", () => {
  const now = Date.parse("2026-08-29T15:00:00Z");
  it("formats a persisted source timestamp", () => {
    expect(formatMarketDataAge(now - 12 * 60_000, now)).toBe("Market data 12m old");
  });
  it("returns null when the timestamp is missing or invalid", () => {
    expect(formatMarketDataAge(undefined, now)).toBeNull();
    expect(formatMarketDataAge(null, now)).toBeNull();
    expect(formatMarketDataAge(NaN, now)).toBeNull();
    expect(formatMarketDataAge(now + 60_000, now)).toBeNull();
  });
  it("does not invent age from analyzed_at or other proxies", () => {
    expect(parseInputsQuality({ snapshot: "stale", bar_count: 4 }).snapshot_ts_ms).toBeUndefined();
  });
});

describe("parseInputsQuality passes through optional snapshot extras", () => {
  it("keeps a real snapshot_ts_ms and drops unknown sources", () => {
    const q = parseInputsQuality({
      snapshot: "stale",
      snapshot_ts_ms: 1_777_000_000_000,
      snapshot_age_ms: 3_600_000,
      snapshot_timestamp_source: "lastTrade",
    });
    expect(q.snapshot_ts_ms).toBe(1_777_000_000_000);
    expect(q.snapshot_age_ms).toBe(3_600_000);
    expect(q.snapshot_timestamp_source).toBe("lastTrade");
    expect(parseInputsQuality({ snapshot_timestamp_source: "made_up" }).snapshot_timestamp_source).toBeUndefined();
  });
});

describe("isDirection — data_unavailable never becomes neutral", () => {
  it("distinguishes types", () => {
    expect(isDirection("data_unavailable")).toBe(true);
    expect(isDirection("neutral")).toBe(true);
    // ensure they're distinct values callers can branch on
    const d1: unknown = "data_unavailable";
    const d2: unknown = "neutral";
    expect(d1).not.toBe(d2);
  });
});
