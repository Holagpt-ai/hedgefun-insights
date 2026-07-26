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
  renderableSignals,
  symbolRoutes,
  timeOfDayLabel,
  validateSection,
  validateWorkspace,
} from "@/lib/pre-market/builders";
import { REASON_TEXT } from "@/components/pre-market/SectionShell";

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

  it("fails session-dependent sections closed when the session is unconfirmed", () => {
    const ws = validateWorkspace(baseWorkspace({
      market_context: { status: "unavailable", reason_code: "MARKET_STATUS_CONTRADICTORY" },
      watchlist_activity: { status: "available", data: [{ ticker: "AAPL" }], as_of: null, reason_code: null },
      risk_attention: { status: "empty", data: [], as_of: null, reason_code: "NO_QUALIFYING_DATA" },
      checklist: { status: "available", data: [{ id: "x", label: "y", count: 1 }], as_of: null, reason_code: null },
    }));
    for (const s of [ws!.watchlist_activity, ws!.risk_attention, ws!.checklist]) {
      expect(s.status).toBe("unavailable");
      expect(s.reason_code).toBe("MARKET_STATUS_CONTRADICTORY");
      expect(s.data).toEqual([]);
    }
    // Sections that do not depend on a confirmed session are untouched.
    expect(ws!.catalyst_watch.status).toBe("available");
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

const FULL_SIGNAL = {
  signal_id: "hod_break",
  label: "New high",
  category: "level",
  kind: "transition",
  direction: "bullish",
  facts: { price: 10.5 },
  inputs: ["price"],
  observed_at: "2026-07-26T13:00:00.000Z",
  rule_version: "w2b1c.1",
};

describe("P1-R1 client guards", () => {
  it("requires watchlist_lifecycle and alerts_included to be honest", () => {
    const ws = validateWorkspace(baseWorkspace({ watchlist_lifecycle: "nope" }));
    expect(ws?.watchlist_lifecycle).toEqual([]);
    expect(ws?.alerts_included).toBe(false);
    const ok = validateWorkspace(baseWorkspace({
      watchlist_lifecycle: [{ ticker: "aapl", label: "Analysis pending" }, { ticker: "1BAD", label: "x" }, { ticker: "MSFT", label: "" }],
      alerts_included: true,
    }));
    expect(ok?.watchlist_lifecycle).toEqual([{ ticker: "AAPL", label: "Analysis pending" }]);
    expect(ok?.alerts_included).toBe(true);
  });

  it("renders only authorized, labeled, deduped signals", () => {
    const out = renderableSignals(
      [
        FULL_SIGNAL,
        { ...FULL_SIGNAL, label: "dupe" },
        { ...FULL_SIGNAL, signal_id: "hacked" },
        { ...FULL_SIGNAL, signal_id: "lod_break", label: "  " },
      ],
      { unavailable: false },
    );
    expect(out).toHaveLength(1);
    expect(out[0].signal_id).toBe("hod_break");
    expect(out[0].label).toBe("New high");
  });

  it("renders no signals for data unavailable rows", () => {
    expect(renderableSignals([FULL_SIGNAL], { unavailable: true })).toEqual([]);
  });
});

describe("P1-R2 complete signal contract", () => {
  const drop = (patch: Record<string, unknown>) =>
    renderableSignals([{ ...FULL_SIGNAL, ...patch }], { unavailable: false }).length;

  it("excludes signals missing category, kind or rule version", () => {
    expect(drop({ category: undefined })).toBe(0);
    expect(drop({ category: "momentum" })).toBe(0);
    expect(drop({ kind: undefined })).toBe(0);
    expect(drop({ kind: "guess" })).toBe(0);
    expect(drop({ rule_version: "w2b1c.0" })).toBe(0);
    expect(drop({ rule_version: undefined })).toBe(0);
  });

  it("excludes signals with malformed facts, inputs or observed time", () => {
    expect(drop({ facts: undefined })).toBe(0);
    expect(drop({ facts: [] })).toBe(0);
    expect(drop({ facts: { nested: { a: 1 } } })).toBe(0);
    expect(drop({ facts: { bad: Number.NaN } })).toBe(0);
    expect(drop({ inputs: undefined })).toBe(0);
    expect(drop({ inputs: "price" })).toBe(0);
    expect(drop({ inputs: [1] })).toBe(0);
    expect(drop({ observed_at: undefined })).toBe(0);
    expect(drop({ observed_at: "nonsense" })).toBe(0);
  });

  it("accepts an explicit null direction but not an unknown one", () => {
    expect(renderableSignals([{ ...FULL_SIGNAL, direction: null }], { unavailable: false })[0].direction).toBeNull();
    expect(drop({ direction: "sideways" })).toBe(0);
    expect(drop({ direction: undefined })).toBe(0);
  });
});

describe("P1-R2 controlled reason messages", () => {
  it("explains every controlled reason instead of a vague error", () => {
    for (const code of [
      "CALENDAR_UNAVAILABLE",
      "CALENDAR_CONTRADICTORY",
      "PROVIDER_TIME_INVALID",
      "INCOMPLETE_COVERAGE",
      "SOURCE_UNVERIFIABLE",
    ]) {
      expect(REASON_TEXT[code]).toBeTruthy();
      expect(REASON_TEXT[code].length).toBeGreaterThan(20);
    }
    expect(REASON_TEXT.CALENDAR_CONTRADICTORY).toContain("cannot be confirmed");
    expect(REASON_TEXT.PROVIDER_TIME_INVALID).toContain("cannot be confirmed");
    expect(REASON_TEXT.SOURCE_UNVERIFIABLE).toContain("timestamp");
    expect(REASON_TEXT.INCOMPLETE_COVERAGE).toContain("withheld");
  });
});

