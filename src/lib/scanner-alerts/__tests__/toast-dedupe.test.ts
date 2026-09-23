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

  it("dedupes by dedupe_key", () => {
    const key = scannerAlertToastKey("scanner_v1:2026-03-15:AAA:RUNNING_UP:x");
    markScannerToastSeen(key);
    expect(readSeenScannerToastKeys().has(key)).toBe(true);
    const rows = [{ dedupe_key: key }, { dedupe_key: "other" }];
    const unseen = filterUnseenScannerAlerts(rows, readSeenScannerToastKeys());
    expect(unseen).toHaveLength(1);
    expect(unseen[0].dedupe_key).toBe("other");
  });
});
