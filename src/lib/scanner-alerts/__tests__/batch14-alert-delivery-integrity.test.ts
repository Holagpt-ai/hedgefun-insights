import { beforeEach, describe, expect, it } from "vitest";
import {
  dedupeScannerAlertsByCanonicalIdentity,
  isCanonicalScannerAlertDedupeKey,
  scannerAlertCanonicalToastKey,
} from "@/lib/scanner-alerts/canonical-event-identity";
import { isPlausibleScannerAlertObservationMs } from "@/lib/scanner-alerts/observation-freshness";
import {
  SCANNER_ALERT_LIVE_POPUP_MAX_AGE_MS,
} from "@/lib/scanner-alerts/observation-freshness";
import {
  filterLiveScannerAlertToasts,
  filterScannerAlertToastBacklog,
  filterUnseenScannerAlerts,
  scannerAlertToastKey,
  shouldSurfaceScannerAlertToast,
} from "@/lib/scanner-alerts/toast-dedupe";
import {
  filterPriceAlertToastBacklog,
  filterPriceAlertToastCandidates,
  PRICE_ALERT_LIVE_POPUP_MAX_AGE_MS,
} from "@/lib/price-alerts/toast-delivery";

const CANONICAL =
  "scanner_v1:2026-10-06:AAA:RUNNING_UP:2026-10-06T14:05:00.000Z";

describe("Batch 14 — scanner alert delivery integrity", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("prefers canonical dedupe_key over row id for toast identity", () => {
    expect(isCanonicalScannerAlertDedupeKey(CANONICAL)).toBe(true);
    expect(
      scannerAlertCanonicalToastKey({ id: "row-b", dedupe_key: CANONICAL }),
    ).toBe(CANONICAL);
    expect(
      scannerAlertCanonicalToastKey({ id: "row-a", dedupe_key: "legacy-noncanonical" }),
    ).toBe("row-a");
  });

  it("collapses two DB rows for the same canonical event", () => {
    const rows = [
      { id: "uuid-1", dedupe_key: CANONICAL, event_at: "2026-10-06T14:05:00.000Z" },
      { id: "uuid-2", dedupe_key: CANONICAL, event_at: "2026-10-06T14:05:00.000Z" },
    ];
    expect(dedupeScannerAlertsByCanonicalIdentity(rows)).toHaveLength(1);
    const seen = new Set([scannerAlertToastKey(rows[0])]);
    expect(filterUnseenScannerAlerts(rows, seen)).toHaveLength(0);
  });

  it("allows two genuine momentum events for the same ticker at different times", () => {
    const first = {
      id: "a1",
      dedupe_key:
        "scanner_v1:2026-10-06:AAA:RUNNING_UP:2026-10-06T14:05:00.000Z",
      event_at: "2026-10-06T14:05:00.000Z",
    };
    const second = {
      id: "a2",
      dedupe_key:
        "scanner_v1:2026-10-06:AAA:RUNNING_UP:2026-10-06T15:10:00.000Z",
      event_at: "2026-10-06T15:10:00.000Z",
    };
    const seen = new Set([scannerAlertToastKey(first)]);
    expect(filterUnseenScannerAlerts([first, second], seen).map((r) => r.id)).toEqual(["a2"]);
  });

  it("late DB insert with old event_at is backlog not live popup", () => {
    const nowMs = Date.parse("2026-10-06T20:00:00.000Z");
    const baselineMs = nowMs;
    const lateInsert = {
      id: "late-hod",
      dedupe_key:
        "scanner_v1:2026-10-06:AAA:NEW_HOD:2026-10-06T10:00:00.000Z",
      event_at: "2026-10-06T10:00:00.000Z",
      created_at: "2026-10-06T19:55:00.000Z",
    };
    expect(shouldSurfaceScannerAlertToast(lateInsert, baselineMs, nowMs)).toBe(false);
    expect(
      filterScannerAlertToastBacklog([lateInsert], new Set(), baselineMs, nowMs).map((r) => r.id),
    ).toEqual(["late-hod"]);
    expect(filterLiveScannerAlertToasts([lateInsert], new Set(), baselineMs, nowMs)).toHaveLength(0);
  });

  it("rejects future-dated observations from live eligibility", () => {
    const nowMs = Date.parse("2026-10-06T20:00:00.000Z");
    const futureMs = nowMs + 60 * 60_000;
    expect(isPlausibleScannerAlertObservationMs(futureMs, nowMs)).toBe(false);
    const row = {
      id: "future",
      dedupe_key: CANONICAL,
      event_at: new Date(futureMs).toISOString(),
      created_at: new Date(nowMs).toISOString(),
    };
    expect(shouldSurfaceScannerAlertToast(row, nowMs, nowMs)).toBe(false);
  });

  it("delayed feed with honest event timestamp can still surface when post-baseline", () => {
    const nowMs = Date.parse("2026-10-06T20:00:00.000Z");
    const baselineMs = Date.parse("2026-10-06T19:00:00.000Z");
    const delayed = {
      id: "delayed",
      dedupe_key:
        "scanner_v1:2026-10-06:BBB:RUNNING_UP:2026-10-06T19:30:00.000Z",
      event_at: "2026-10-06T19:30:00.000Z",
      created_at: "2026-10-06T19:45:00.000Z",
    };
    expect(nowMs - Date.parse(delayed.event_at)).toBeLessThanOrEqual(SCANNER_ALERT_LIVE_POPUP_MAX_AGE_MS);
    expect(shouldSurfaceScannerAlertToast(delayed, baselineMs, nowMs)).toBe(true);
  });

  it("aged observation within query lookback but outside live window becomes backlog", () => {
    const nowMs = Date.parse("2026-10-06T20:00:00.000Z");
    const baselineMs = Date.parse("2026-10-06T12:00:00.000Z");
    const aged = {
      id: "aged",
      dedupe_key:
        "scanner_v1:2026-10-06:AAA:RUNNING_UP:2026-10-06T15:00:00.000Z",
      event_at: "2026-10-06T15:00:00.000Z",
      created_at: "2026-10-06T19:59:00.000Z",
    };
    expect(nowMs - Date.parse(aged.event_at)).toBeGreaterThan(SCANNER_ALERT_LIVE_POPUP_MAX_AGE_MS);
    expect(shouldSurfaceScannerAlertToast(aged, baselineMs, nowMs)).toBe(false);
    expect(filterLiveScannerAlertToasts([aged], new Set(), baselineMs, nowMs)).toHaveLength(0);
    expect(filterScannerAlertToastBacklog([aged], new Set(), baselineMs, nowMs).map((r) => r.id)).toEqual([
      "aged",
    ]);
  });

  it("legacy row-id seen history suppresses duplicate canonical rows after upgrade", () => {
    const rows = [
      { id: "uuid-1", dedupe_key: CANONICAL, event_at: "2026-10-06T14:05:00.000Z" },
      { id: "uuid-2", dedupe_key: CANONICAL, event_at: "2026-10-06T14:05:00.000Z" },
    ];
    const legacySeen = new Set(["uuid-1"]);
    expect(filterUnseenScannerAlerts(rows, legacySeen)).toHaveLength(0);
  });
});

describe("Batch 14 — price alert live popup freshness", () => {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

  it("aged trigger within 24h query but outside live window is backlog only", () => {
    const nowMs = Date.parse("2026-10-06T20:00:00.000Z");
    const baselineMs = Date.parse("2026-10-06T10:00:00.000Z");
    const aged = {
      id: id(1),
      delivery_status: "delivered",
      seen_at: null,
      triggered_at: "2026-10-06T17:00:00.000Z",
    };
    expect(nowMs - Date.parse(aged.triggered_at)).toBeGreaterThan(PRICE_ALERT_LIVE_POPUP_MAX_AGE_MS);
    expect(
      filterPriceAlertToastCandidates([aged], new Set(), { baselineMs, nowMs }),
    ).toHaveLength(0);
    expect(filterPriceAlertToastBacklog([aged], new Set(), baselineMs, nowMs).map((r) => r.id)).toEqual([
      id(1),
    ]);
  });

  it("15-minute delayed observation within live window still surfaces", () => {
    const nowMs = Date.parse("2026-10-06T20:00:00.000Z");
    const baselineMs = Date.parse("2026-10-06T19:00:00.000Z");
    const delayed = {
      id: id(2),
      delivery_status: "delivered",
      seen_at: null,
      triggered_at: "2026-10-06T19:45:00.000Z",
    };
    expect(
      filterPriceAlertToastCandidates([delayed], new Set(), { baselineMs, nowMs }).map((r) => r.id),
    ).toEqual([id(2)]);
  });
});
