import { beforeEach, describe, expect, it } from "vitest";
import {
  dedupeScannerAlertsByCanonicalIdentity,
  isCanonicalScannerAlertDedupeKey,
  scannerAlertCanonicalToastKey,
} from "@/lib/scanner-alerts/canonical-event-identity";
import { isPlausibleScannerAlertObservationMs } from "@/lib/scanner-alerts/observation-freshness";
import {
  filterLiveScannerAlertToasts,
  filterScannerAlertToastBacklog,
  filterUnseenScannerAlerts,
  scannerAlertToastKey,
  shouldSurfaceScannerAlertToast,
} from "@/lib/scanner-alerts/toast-dedupe";

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
    expect(shouldSurfaceScannerAlertToast(delayed, baselineMs, nowMs)).toBe(true);
  });
});
