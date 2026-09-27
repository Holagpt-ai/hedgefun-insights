import { describe, expect, it } from "vitest";
import { evaluatePriceAlert } from "../evaluate";
import type { AlertEvalInput } from "../evaluate";
import { QUOTE_STALE_MS } from "../types";
import {
  normalizePolygonTimestampToMs,
  observedAtMsToIso,
} from "../../../../supabase/functions/_shared/price-alerts/normalize-timestamp.ts";

describe("normalizePolygonTimestampToMs", () => {
  it("converts Polygon nanosecond timestamps to milliseconds", () => {
    const ns = 1_726_000_000_000_000_000;
    const ms = normalizePolygonTimestampToMs(ns, 0);
    expect(ms).toBe(1_726_000_000_000);
    expect(observedAtMsToIso(ms)).toMatch(/^2024-/);
  });

  it("leaves millisecond timestamps unchanged", () => {
    const ms = 1_726_000_000_000;
    expect(normalizePolygonTimestampToMs(ms, 0)).toBe(ms);
  });

  it("does not crash on missing or invalid values", () => {
    const fallback = 1_700_000_000_000;
    expect(normalizePolygonTimestampToMs(null, fallback)).toBe(fallback);
    expect(normalizePolygonTimestampToMs(undefined, fallback)).toBe(fallback);
    expect(observedAtMsToIso(null)).toBeNull();
  });

  it("normalized old quote is treated as stale in evaluation", () => {
    const now = Date.now();
    const oldMs = now - QUOTE_STALE_MS - 60_000;
    const ns = oldMs * 1_000_000;
    const observedAtMs = normalizePolygonTimestampToMs(ns, now);

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

    const out = evaluatePriceAlert(
      base,
      { price: 150, observedAtMs, latency: "live_delayed" },
      now,
    );
    expect(out.shouldTrigger).toBe(false);
    expect(out.skipReason).toBe("stale");
  });
});

describe("price alert crossing unchanged after timestamp fix", () => {
  it("still crosses above on fresh quotes", () => {
    const out = evaluatePriceAlert(
      {
        condition: "price_above",
        threshold: 100,
        referencePrice: null,
        lastObservedPrice: 99,
        armed: true,
        status: "active",
        recurrence: "recurring",
        cooldownMinutes: 60,
        lastTriggeredAtMs: null,
      },
      { price: 101, observedAtMs: Date.now(), latency: "live_delayed" },
    );
    expect(out.shouldTrigger).toBe(true);
  });
});
