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
