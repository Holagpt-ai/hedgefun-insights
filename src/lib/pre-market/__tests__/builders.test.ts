import { describe, it, expect } from "vitest";
import {
  directionLabel,
  formatPercent,
  formatPrice,
  formatVolume,
  marketContextLabel,
  normalizeSymbol,
  numberOrDash,
  relativeAge,
  symbolRoutes,
  timeOfDayLabel,
  validateSection,
  validateWorkspace,
} from "@/lib/pre-market/builders";

function baseWorkspace(overrides: Record<string, unknown> = {}) {
  const section = (data: unknown) => ({ status: "available", data, as_of: null, reason_code: null });
  return {
    contract_version: 1,
    server_now: "2026-07-26T13:30:00.000Z",
    market_context: { status: "premarket", et_date: "2026-07-26", et_time: "09:30" },
    indexes: section([]),
    watchlist_activity: section([]),
    risk_attention: section([]),
    catalyst_watch: section([]),
    earnings: section([]),
    volume_leaders: section([]),
    journal_readiness: section({ open_trades: 0, missing_stop: 0, missing_target: 0, symbols: [] }),
    headlines: section([]),
    checklist: section([]),
    ...overrides,
  };
}

describe("pre-market symbol handling", () => {
  it("normalizes and rejects invalid symbols", () => {
    expect(normalizeSymbol(" aapl ")).toBe("AAPL");
    expect(normalizeSymbol("BRK.B")).toBe("BRK.B");
    expect(normalizeSymbol("1ABC")).toBeNull();
    expect(normalizeSymbol("<script>")).toBeNull();
    expect(normalizeSymbol(null)).toBeNull();
  });

  it("builds encoded workflow routes only for valid symbols", () => {
    const r = symbolRoutes("brk.b");
    expect(r?.ai).toBe("/dashboard/ai?symbol=BRK.B");
    expect(r?.catalyst).toBe("/dashboard/catalyst?symbol=BRK.B");
    expect(r?.watchlist).toBe("/dashboard/watchlist?symbol=BRK.B");
    expect(r?.journal).toBe("/dashboard/journal?symbol=BRK.B");
    expect(symbolRoutes("not a symbol")).toBeNull();
  });
});

describe("contract validation fails closed", () => {
  it("rejects wrong contract version or bad server_now", () => {
    expect(validateWorkspace(baseWorkspace({ contract_version: 2 }))).toBeNull();
    expect(validateWorkspace(baseWorkspace({ server_now: "nonsense" }))).toBeNull();
    expect(validateWorkspace(null)).toBeNull();
  });

  it("degrades a malformed section to unavailable instead of empty", () => {
    const ws = validateWorkspace(baseWorkspace({ indexes: { status: "bogus", data: [] } }));
    expect(ws?.indexes.status).toBe("unavailable");
    expect(ws?.indexes.reason_code).toBe("QUERY_FAILED");
    expect(ws?.indexes.data).toEqual([]);
  });

  it("marks unknown market status as unavailable, never as a session", () => {
    const ws = validateWorkspace(baseWorkspace({ market_context: { status: "party_time" } }));
    expect(ws?.market_context.status).toBe("unavailable");
    expect(marketContextLabel(ws!.market_context.status)).toBe("Market session unavailable");
  });

  it("validateSection rejects array/object shape mismatches", () => {
    expect(validateSection({ status: "available", data: {} }, [], true).status).toBe("unavailable");
    expect(validateSection({ status: "available", data: [] }, {}, false).status).toBe("unavailable");
    expect(validateSection({ status: "empty", data: [] }, [], true).status).toBe("empty");
  });
});

describe("honest labeling", () => {
  it("never renders missing numerics as zero", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPercent(undefined)).toBe("—");
    expect(formatVolume(null)).toBe("—");
    expect(numberOrDash(Number.NaN, (n) => String(n))).toBe("—");
    expect(formatPrice(0)).toBe("$0.0000");
    expect(formatPercent(0)).toBe("+0.00%");
  });

  it("labels sessions without implying pre-market when it is not", () => {
    expect(marketContextLabel("premarket")).toBe("Pre-Market session active");
    expect(marketContextLabel("regular")).toContain("no Pre-Market session active");
    expect(marketContextLabel("non_trading_day")).toContain("no Pre-Market session active");
  });

  it("labels unknown AI direction as Data Unavailable", () => {
    expect(directionLabel("data_unavailable")).toBe("Data Unavailable");
    expect(directionLabel("moon")).toBe("Data Unavailable");
    expect(directionLabel("bullish")).toBe("Bullish");
    expect(timeOfDayLabel(null)).toBe("Time unavailable");
    expect(timeOfDayLabel("before_open")).toBe("Before Open");
  });

  it("computes relative age and rejects unusable timestamps", () => {
    const now = Date.parse("2026-07-26T14:00:00.000Z");
    expect(relativeAge("2026-07-26T13:56:00.000Z", now)).toBe("4m ago");
    expect(relativeAge("2026-07-26T11:00:00.000Z", now)).toBe("3h ago");
    expect(relativeAge(null, now)).toBeNull();
    expect(relativeAge("garbage", now)).toBeNull();
  });

  it("formats volume compactly", () => {
    expect(formatVolume(2_400_000)).toBe("2.4M");
    expect(formatVolume(12_000)).toBe("12K");
  });
});
