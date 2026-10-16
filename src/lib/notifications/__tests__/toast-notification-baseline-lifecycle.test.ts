import { beforeEach, describe, expect, it } from "vitest";
import {
  ensureToastNotificationBaselineMs,
  getToastNotificationBaselineMs,
} from "@/lib/notifications/toast-notification-baseline";
import {
  filterLiveScannerAlertToasts,
  filterScannerAlertToastBacklog,
} from "@/lib/scanner-alerts/toast-dedupe";
import {
  filterPriceAlertToastBacklog,
  filterPriceAlertToastCandidates,
  PRICE_ALERT_TOAST_BASELINE_NS,
} from "@/lib/price-alerts/toast-delivery";
import { SCANNER_ALERT_TOAST_BASELINE_NS } from "@/lib/scanner-alerts/toast-dedupe";

describe("toast notification baseline lifecycle", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("price: empty initial query then first real alert is not suppressed", () => {
    const sessionStart = 1_000;
    ensureToastNotificationBaselineMs(PRICE_ALERT_TOAST_BASELINE_NS, "user-a", sessionStart);
    const baselineMs = getToastNotificationBaselineMs(PRICE_ALERT_TOAST_BASELINE_NS, "user-a", 5_000);
    const newAlert = {
      id: "a1",
      delivery_status: "delivered",
      seen_at: null,
      triggered_at: new Date(4_000).toISOString(),
    };
    expect(baselineMs).toBe(sessionStart);
    expect(
      filterPriceAlertToastCandidates([newAlert], new Set(), { baselineMs }).map((r) => r.id),
    ).toEqual(["a1"]);
  });

  it("price: genuine new alert after established baseline toasts", () => {
    const baselineMs = ensureToastNotificationBaselineMs(PRICE_ALERT_TOAST_BASELINE_NS, "user-a", 10_000);
    const live = {
      id: "live",
      delivery_status: "delivered",
      seen_at: null,
      triggered_at: new Date(12_000).toISOString(),
    };
    expect(filterPriceAlertToastCandidates([live], new Set(), { baselineMs }).map((r) => r.id)).toEqual(["live"]);
  });

  it("price: new browser session suppresses old backlog", () => {
    ensureToastNotificationBaselineMs(PRICE_ALERT_TOAST_BASELINE_NS, "user-a", 10_000);
    sessionStorage.clear();
    const baselineMs = ensureToastNotificationBaselineMs(PRICE_ALERT_TOAST_BASELINE_NS, "user-a", 20_000);
    const old = {
      id: "old",
      delivery_status: "delivered",
      seen_at: null,
      triggered_at: new Date(15_000).toISOString(),
    };
    expect(filterPriceAlertToastBacklog([old], new Set(), baselineMs).map((r) => r.id)).toEqual(["old"]);
    expect(filterPriceAlertToastCandidates([old], new Set(), { baselineMs })).toHaveLength(0);
  });

  it("scanner: new browser session suppresses historic delivery backlog", () => {
    sessionStorage.clear();
    const baselineMs = ensureToastNotificationBaselineMs(SCANNER_ALERT_TOAST_BASELINE_NS, "user-a", 20_000);
    const historic = {
      id: "hist",
      dedupe_key: "k1",
      event_at: new Date(15_000).toISOString(),
      created_at: new Date(15_500).toISOString(),
    };
    const fresh = {
      id: "fresh",
      dedupe_key: "k2",
      event_at: new Date(21_000).toISOString(),
      created_at: new Date(21_100).toISOString(),
    };
    expect(filterScannerAlertToastBacklog([historic, fresh], new Set(), baselineMs).map((r) => r.id)).toEqual([
      "hist",
    ]);
    expect(filterLiveScannerAlertToasts([historic, fresh], new Set(), baselineMs).map((r) => r.id)).toEqual([
      "fresh",
    ]);
  });

  it("account switch uses independent session floors", () => {
    expect(ensureToastNotificationBaselineMs(PRICE_ALERT_TOAST_BASELINE_NS, "user-a", 1000)).toBe(1000);
    expect(ensureToastNotificationBaselineMs(PRICE_ALERT_TOAST_BASELINE_NS, "user-b", 2000)).toBe(2000);
    expect(getToastNotificationBaselineMs(PRICE_ALERT_TOAST_BASELINE_NS, "user-a", 9000)).toBe(1000);
  });
});
