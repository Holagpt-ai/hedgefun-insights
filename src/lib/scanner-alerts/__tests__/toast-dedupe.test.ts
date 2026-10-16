import { describe, it, expect, beforeEach } from "vitest";
import {
  filterLiveScannerAlertToasts,
  filterScannerAlertToastBacklog,
  filterUnseenScannerAlerts,
  markScannerToastSeen,
  markScannerToastSeenDurable,
  mergeScannerToastSeenKeys,
  readSeenScannerToastKeys,
  scannerAlertToastKey,
} from "@/lib/scanner-alerts/toast-dedupe";

describe("scanner alert toast dedupe", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("dedupes by canonical dedupe_key when present", () => {
    const canonical = "scanner_v1:2026-03-15:AAA:RUNNING_UP:2026-03-15T14:00:00.000Z";
    const row = { id: "alert-uuid-1", dedupe_key: canonical };
    const key = scannerAlertToastKey(row);
    markScannerToastSeen("user-a", key);
    expect(readSeenScannerToastKeys("user-a").has(key)).toBe(true);
    const duplicateRow = { id: "alert-uuid-2", dedupe_key: canonical };
    const other = { id: "alert-uuid-3", dedupe_key: "legacy-key-without-canonical-shape" };
    const unseen = filterUnseenScannerAlerts(
      [row, duplicateRow, other],
      readSeenScannerToastKeys("user-a"),
    );
    expect(unseen.map((r) => r.id)).toEqual(["alert-uuid-3"]);
  });

  it("allows a new event for the same symbol when id differs", () => {
    const seen = new Set([scannerAlertToastKey({ id: "a1", dedupe_key: "k1" })]);
    const rows = [
      { id: "a1", dedupe_key: "k1" },
      { id: "a2", dedupe_key: "k2" },
    ];
    expect(filterUnseenScannerAlerts(rows, seen).map((r) => r.id)).toEqual(["a2"]);
  });

  it("does not leak session seen keys across accounts", () => {
    markScannerToastSeen("user-a", "key-1");
    expect(readSeenScannerToastKeys("user-b").has("key-1")).toBe(false);
  });

  it("simulates cross-tab durable merge for the same alert id", () => {
    markScannerToastSeenDurable("user-1", "alert-1", Date.now());
    const merged = mergeScannerToastSeenKeys("user-1");
    const rows = [{ id: "alert-1", dedupe_key: "k1", event_at: "2026-10-06T20:00:00.000Z" }];
    expect(filterUnseenScannerAlerts(rows, merged)).toHaveLength(0);
  });

  it("baseline suppresses pre-session delivery backlog", () => {
    const baselineMs = Date.parse("2026-10-06T20:00:00.000Z");
    const backlog = {
      id: "old",
      dedupe_key: "k-old",
      event_at: "2026-10-06T18:00:00.000Z",
      created_at: "2026-10-06T18:01:00.000Z",
    };
    const live = {
      id: "new",
      dedupe_key: "k-new",
      event_at: "2026-10-06T20:05:00.000Z",
      created_at: "2026-10-06T20:05:01.000Z",
    };
    const nowMs = Date.parse("2026-10-06T21:00:00.000Z");
    expect(
      filterScannerAlertToastBacklog([backlog, live], new Set(), baselineMs, nowMs).map((r) => r.id),
    ).toEqual(["old"]);
    expect(
      filterLiveScannerAlertToasts([backlog, live], new Set(), baselineMs, nowMs).map((r) => r.id),
    ).toEqual(["new"]);
  });
});
