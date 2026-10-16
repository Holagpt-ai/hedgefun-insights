import { describe, expect, it } from "vitest";
import {
  buildMarketEvidenceHandoff,
  formatMarketEvidenceContextLine,
  validateMarketEvidenceHandoff,
  MARKET_EVIDENCE_HANDOFF_MAX_AGE_MS,
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

  it("rejects expired and cross-account handoffs", () => {
    const now = Date.parse("2026-10-06T20:00:00.000Z");
    const fresh = buildMarketEvidenceHandoff({
      symbol: "AAA",
      contextScope: "current_session",
      sourceSurface: "morning_opportunity",
      userId: "user-a",
      nowMs: now,
    })!;
    expect(validateMarketEvidenceHandoff(fresh, { userId: "user-a", nowMs: now })).not.toBeNull();
    expect(validateMarketEvidenceHandoff(fresh, { userId: "user-b", nowMs: now })).toBeNull();
    expect(
      validateMarketEvidenceHandoff(fresh, {
        userId: "user-a",
        nowMs: now + MARKET_EVIDENCE_HANDOFF_MAX_AGE_MS + 1,
      }),
    ).toBeNull();
  });
});
