import { describe, expect, it } from "vitest";
import { evaluatePriceAlert } from "../evaluate";
import type { AlertEvalInput } from "../evaluate";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";

const base: AlertEvalInput = {
  condition: "price_above",
  threshold: 100,
  referencePrice: null,
  lastObservedPrice: 99,
  armed: true,
  status: "active",
  recurrence: "recurring",
  cooldownMinutes: 60,
  lastTriggeredAtMs: null,
};

function quote(price: number, latency: "live_delayed" | "stale" | "unavailable" = "live_delayed") {
  return { price, observedAtMs: Date.now(), latency };
}

describe("price alerts v1 evaluation", () => {
  it("creates crossing above when price moves over threshold", () => {
    const out = evaluatePriceAlert(base, quote(101));
    expect(out.shouldTrigger).toBe(true);
    expect(out.nextArmed).toBe(false);
  });

  it("does not trigger below threshold without cross", () => {
    const out = evaluatePriceAlert(base, quote(100));
    expect(out.shouldTrigger).toBe(false);
    expect(out.skipReason).toBe("no_cross");
  });

  it("crossing below threshold", () => {
    const input: AlertEvalInput = { ...base, condition: "price_below", threshold: 50, lastObservedPrice: 51 };
    const out = evaluatePriceAlert(input, quote(49));
    expect(out.shouldTrigger).toBe(true);
  });

  it("no trigger before crossing above", () => {
    const init = evaluatePriceAlert({ ...base, lastObservedPrice: null }, quote(105));
    expect(init.shouldTrigger).toBe(false);
    expect(init.skipReason).toBe("init_only");
  });

  it("skips stale data", () => {
    const out = evaluatePriceAlert(base, quote(110, "stale"));
    expect(out.shouldTrigger).toBe(false);
    expect(out.skipReason).toBe("stale");
  });

  it("suppresses repeated trigger during cooldown", () => {
    const out = evaluatePriceAlert(
      { ...base, lastTriggeredAtMs: Date.now() - 30_000 },
      quote(105),
    );
    expect(out.shouldTrigger).toBe(false);
    expect(out.skipReason).toBe("cooldown");
  });

  it("re-arms recurring alert after price falls back", () => {
    const afterTrigger = evaluatePriceAlert(base, quote(101));
    expect(afterTrigger.nextArmed).toBe(false);
    const rearm = evaluatePriceAlert(
      { ...base, armed: false, lastObservedPrice: 101 },
      quote(99),
    );
    expect(rearm.nextArmed).toBe(true);
  });

  it("one-time alert pauses after trigger", () => {
    const out = evaluatePriceAlert({ ...base, recurrence: "one_time" }, quote(101));
    expect(out.shouldTrigger).toBe(true);
    expect(out.nextStatus).toBe("paused");
  });

  it("paused alert does not evaluate", () => {
    const out = evaluatePriceAlert({ ...base, status: "paused" }, quote(200));
    expect(out.skipReason).toBe("paused");
  });

  it("percent move up crossing", () => {
    const input: AlertEvalInput = {
      ...base,
      condition: "percent_move_up",
      threshold: 5,
      referencePrice: 100,
      lastObservedPrice: 103,
    };
    const out = evaluatePriceAlert(input, quote(106));
    expect(out.shouldTrigger).toBe(true);
    expect(out.observedMovePct).toBeCloseTo(6, 1);
  });

  it("rejects invalid symbols", () => {
    expect(normalizeHandoffSymbol("")).toBeNull();
    expect(normalizeHandoffSymbol("bad sym")).toBeNull();
    expect(normalizeHandoffSymbol("AAPL")).toBe("AAPL");
  });

  it("unavailable quote fails soft", () => {
    const out = evaluatePriceAlert(base, quote(0, "unavailable"));
    expect(out.shouldTrigger).toBe(false);
    expect(out.skipReason).toBe("unavailable");
  });
});

describe("symbol handoff for alerts UI", () => {
  it("normalizes handoff query symbols", () => {
    expect(normalizeHandoffSymbol(" nvda ")).toBe("NVDA");
  });
});

describe("pause / resume semantics", () => {
  it("maps enabled flag to active evaluation", () => {
    const paused = evaluatePriceAlert({ ...base, status: "paused" }, quote(200));
    expect(paused.shouldTrigger).toBe(false);
    const active = evaluatePriceAlert({ ...base, status: "active" }, quote(101));
    expect(active.shouldTrigger).toBe(true);
  });
});
