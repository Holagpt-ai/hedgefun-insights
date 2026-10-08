import { describe, expect, it } from "vitest";
import {
  dedupePriceAlertTriggersById,
  filterPriceAlertToastCandidates,
  markPriceAlertToastSeenInSession,
  readSeenPriceAlertToastIds,
  isPriceAlertToastPending,
  priceAlertToastSinceIso,
} from "../toast-delivery";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function row(n: number, overrides: Partial<{ delivery_status: string; seen_at: string | null }> = {}) {
  return {
    id: id(n),
    delivery_status: "delivered",
    seen_at: null as string | null,
    symbol: "AAPL",
    ...overrides,
  };
}

describe("price alert toast delivery", () => {
  it("CASE A — first delivery: undelivered trigger is a toast candidate", () => {
    const candidates = filterPriceAlertToastCandidates([row(1)], new Set());
    expect(candidates).toHaveLength(1);
    expect(isPriceAlertToastPending(row(1))).toBe(true);
  });

  it("CASE B — reload after delivery: seen_at set excludes popup", () => {
    const seen = row(1, { seen_at: new Date().toISOString() });
    expect(filterPriceAlertToastCandidates([seen], new Set())).toHaveLength(0);
    expect(isPriceAlertToastPending(seen)).toBe(false);
  });

  it("CASE C — old 24h alert already seen: no candidate", () => {
    const old = row(2, {
      seen_at: "2026-10-05T12:00:00.000Z",
    });
    expect(filterPriceAlertToastCandidates([old], new Set())).toHaveLength(0);
  });

  it("CASE D — multiple historical delivered+seen: no popup storm", () => {
    const rows = [1, 2, 3].map((n) =>
      row(n, { seen_at: "2026-10-06T10:00:00.000Z" }),
    );
    expect(filterPriceAlertToastCandidates(rows, new Set())).toHaveLength(0);
  });

  it("CASE E — mixed old seen + one new: exactly one candidate", () => {
    const rows = [
      row(1, { seen_at: "2026-10-06T08:00:00.000Z" }),
      row(2, { seen_at: "2026-10-06T09:00:00.000Z" }),
      row(3, { seen_at: "2026-10-06T10:00:00.000Z" }),
      row(4),
    ];
    expect(filterPriceAlertToastCandidates(rows, new Set()).map((r) => r.id)).toEqual([id(4)]);
  });

  it("CASE F — duplicate fetch same id: single candidate", () => {
    const r = row(1);
    const deduped = dedupePriceAlertTriggersById([r, r, r]);
    expect(deduped).toHaveLength(1);
    expect(filterPriceAlertToastCandidates([r, r], new Set())).toHaveLength(1);
  });

  it("CASE G — legitimate retrigger: distinct event ids both notify when unseen", () => {
    const first = row(1, { seen_at: "2026-10-06T08:00:00.000Z" });
    const second = row(2);
    const candidates = filterPriceAlertToastCandidates([first, second], new Set());
    expect(candidates.map((c) => c.id)).toEqual([id(2)]);
  });

  it("CASE H — session dedupe without durable seen_at: still eligible on empty session set", () => {
    const pending = row(1);
    expect(filterPriceAlertToastCandidates([pending], new Set())).toHaveLength(1);
  });

  it("shown alerts stay suppressed across refresh while seen_at is still null", () => {
    sessionStorage.removeItem("stocksist-price-alert-toasts-v1");
    markPriceAlertToastSeenInSession(id(1));
    const reloaded = readSeenPriceAlertToastIds();
    expect(filterPriceAlertToastCandidates([row(1)], reloaded)).toHaveLength(0);
    expect(filterPriceAlertToastCandidates([row(2)], reloaded).map((r) => r.id)).toEqual([id(2)]);
  });

  it("CASE H — session marks in-flight; durable seen_at remains source of truth on reload", () => {
    const pending = row(1);
    const sessionSeen = new Set([id(1)]);
    expect(filterPriceAlertToastCandidates([pending], sessionSeen)).toHaveLength(0);
    expect(filterPriceAlertToastCandidates([pending], new Set())).toHaveLength(1);
  });

  it("does not toast failed or pending delivery_status", () => {
    expect(isPriceAlertToastPending(row(1, { delivery_status: "pending" }))).toBe(false);
    expect(isPriceAlertToastPending(row(1, { delivery_status: "failed" }))).toBe(false);
  });

  it("priceAlertToastSinceIso uses 24h lookback", () => {
    const now = Date.parse("2026-10-06T20:00:00.000Z");
    expect(priceAlertToastSinceIso(now)).toBe("2026-10-05T20:00:00.000Z");
  });
});
