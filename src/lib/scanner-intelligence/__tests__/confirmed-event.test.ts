import { describe, expect, it } from "vitest";
import { confirmStoredScannerEvent } from "@/lib/scanner-intelligence/confirmed-event";

describe("URL scanner events are not evidence by themselves", () => {
  it("drops a claimed event when nothing stored matches", () => {
    expect(confirmStoredScannerEvent("RUNNING_UP", [])).toBeNull();
    expect(confirmStoredScannerEvent("RUNNING_UP", [null, "VWAP_LOSS"])).toBeNull();
    expect(confirmStoredScannerEvent("not-a-real-event", ["RUNNING_UP"])).toBeNull();
  });

  it("keeps the event only when stored radar data has the same type", () => {
    expect(confirmStoredScannerEvent("RUNNING_UP", ["HOD_BREAK", "RUNNING_UP"])).toBe("RUNNING_UP");
    expect(confirmStoredScannerEvent("HIGH_OF_DAY_MOMENTUM", ["HOD_MOMENTUM"])).toBe("HOD_MOMENTUM");
  });
});
