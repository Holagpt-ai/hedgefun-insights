import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  markAccountToastHistory,
  readAccountToastHistory,
} from "@/lib/notifications/account-toast-history";
import {
  filterPriceAlertToastCandidates,
  markPriceAlertToastSeenDurable,
  mergePriceAlertToastSeenIds,
} from "@/lib/price-alerts/toast-delivery";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("Batch 14 — reload and storage integrity", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("reload suppresses price alert when durable history exists but seen_at ack failed", () => {
    const row = {
      id: id(1),
      delivery_status: "delivered",
      seen_at: null,
      triggered_at: "2026-10-06T20:05:00.000Z",
    };
    markPriceAlertToastSeenDurable("user-1", row.id, Date.parse("2026-10-06T20:06:00.000Z"));
    sessionStorage.clear();
    const merged = mergePriceAlertToastSeenIds("user-1", Date.parse("2026-10-06T20:10:00.000Z"));
    const baselineMs = Date.parse("2026-10-06T20:00:00.000Z");
    expect(
      filterPriceAlertToastCandidates([row], merged, {
        baselineMs,
        nowMs: Date.parse("2026-10-06T20:10:00.000Z"),
      }),
    ).toHaveLength(0);
  });

  it("repeated poll with unchanged rows does not expand candidates after session mark", () => {
    const row = {
      id: id(2),
      delivery_status: "delivered",
      seen_at: null,
      triggered_at: "2026-10-06T20:05:00.000Z",
    };
    const baselineMs = Date.parse("2026-10-06T20:00:00.000Z");
    const nowMs = Date.parse("2026-10-06T20:10:00.000Z");
    const seen = new Set<string>();
    const first = filterPriceAlertToastCandidates([row, row], seen, { baselineMs, nowMs });
    expect(first).toHaveLength(1);
    seen.add(row.id);
    expect(filterPriceAlertToastCandidates([row, row], seen, { baselineMs, nowMs })).toHaveLength(0);
  });

  it("memory fallback prevents replay when localStorage is unavailable", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    markAccountToastHistory("price-alerts", "user-a", "trigger-1", {
      nowMs: 1000,
      maxAgeMs: 60_000,
      maxEntries: 50,
    });
    expect(readAccountToastHistory("price-alerts", "user-a", {
      nowMs: 1000,
      maxAgeMs: 60_000,
      maxEntries: 50,
    }).has("trigger-1")).toBe(true);
    setItem.mockRestore();
  });

  it("account-scoped history does not leak across users after switch", () => {
    markPriceAlertToastSeenDurable("user-a", id(9), Date.now());
    expect(mergePriceAlertToastSeenIds("user-b").has(id(9))).toBe(false);
  });
});
