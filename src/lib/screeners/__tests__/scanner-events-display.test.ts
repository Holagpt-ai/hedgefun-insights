import { describe, expect, it } from "vitest";
import { resolveScannerSignalLabel } from "@/lib/screeners/scanner-events-display";
import { evaluateScreenerTriggerTime } from "@/lib/screeners/screener-trigger-time";

describe("scanner events display", () => {
  it("prefers scanner event label over lifecycle signal", () => {
    expect(
      resolveScannerSignalLabel({
        primaryScannerEvent: "RUNNING_UP",
        fallbackSignal: "BUILDING",
      }),
    ).toBe("RUNNING UP");
  });

  it("uses primary scanner event timestamp for trigger column", () => {
    const view = evaluateScreenerTriggerTime({
      symbol: "AAA",
      radar_trading_date: "2026-09-23",
      primary_scanner_event: "VOLUME_EXPLOSION",
      primary_scanner_event_at: "2026-09-23T14:30:00.000Z",
      promoted_at: "2026-09-23T13:00:00.000Z",
    });
    expect(view.primary?.triggeredAt).toBe("2026-09-23T14:30:00.000Z");
    expect(view.primary?.eventKey).toBe("VOLUME_EXPLOSION");
  });
});
