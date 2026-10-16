import { describe, expect, it } from "vitest";
import {
  buildMarketEvidenceHandoff,
  formatMarketEvidenceContextLine,
} from "@/lib/daily-intelligence/market-evidence-handoff";

describe("market evidence handoff", () => {
  it("formats context-only lines without implying a live quote", () => {
    const payload = buildMarketEvidenceHandoff({
      symbol: "aapl",
      contextScope: "current_session",
      sourceSurface: "morning_opportunity",
      providerAsOf: "2026-09-29T12:00:00.000Z",
      primaryScannerEvent: "RUNNING_UP",
    });
    expect(payload).not.toBeNull();
    const line = formatMarketEvidenceContextLine(payload!);
    expect(line).toContain("not a live quote");
    expect(line).toContain("morning opportunity");
  });
});
