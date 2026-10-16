import { describe, it, expect, beforeEach } from "vitest";
import {
  filterUnseenScannerAlerts,
  markScannerToastSeen,
  readSeenScannerToastKeys,
  scannerAlertToastKey,
} from "@/lib/scanner-alerts/toast-dedupe";

describe("scanner alert toast dedupe", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("dedupes by stable alert id", () => {
    const row = { id: "alert-uuid-1", dedupe_key: "scanner_v1:2026-03-15:AAA:RUNNING_UP:x" };
    const key = scannerAlertToastKey(row);
    markScannerToastSeen(key);
    expect(readSeenScannerToastKeys().has(key)).toBe(true);
    const rows = [row, { id: "alert-uuid-2", dedupe_key: "other" }];
    const unseen = filterUnseenScannerAlerts(rows, readSeenScannerToastKeys());
    expect(unseen).toHaveLength(1);
    expect(unseen[0].id).toBe("alert-uuid-2");
  });

  it("allows a new event for the same symbol when id differs", () => {
    const seen = new Set([scannerAlertToastKey({ id: "a1", dedupe_key: "k1" })]);
    const rows = [
      { id: "a1", dedupe_key: "k1" },
      { id: "a2", dedupe_key: "k2" },
    ];
    expect(filterUnseenScannerAlerts(rows, seen).map((r) => r.id)).toEqual(["a2"]);
  });
});
