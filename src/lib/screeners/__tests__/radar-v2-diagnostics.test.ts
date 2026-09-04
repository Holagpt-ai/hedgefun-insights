import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  isRadarDebugEnabled,
  peekRadarV2LoadDiagnostic,
  radarV2ReasonFamily,
  recordRadarV2LoadDiagnostic,
  resetRadarV2LoadDiagnostic,
  RADAR_V2_DECISION_REASONS,
} from "@/lib/screeners/radar-v2-diagnostics";

describe("Radar V2 load diagnostics (D11 / D15)", () => {
  beforeEach(() => {
    resetRadarV2LoadDiagnostic();
  });

  it("records machine-readable reasons without exposing them as UI copy", () => {
    expect(RADAR_V2_DECISION_REASONS).toEqual(expect.arrayContaining([
      "radar_v2_available",
      "radar_v2_empty",
      "no_current_feed_state",
      "session_not_active",
      "no_v2_generation",
      "radar_v2_stale",
      "radar_v2_receive_stale",
      "generation_race",
      "radar_v2_fetch_error",
      "radar_v2_retry_exhausted",
    ]));
    recordRadarV2LoadDiagnostic({
      reason: "generation_race",
      source: "fallback",
      session: "pre-market",
      attempts: 1,
      generationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      declaredCandidateCount: 128,
      lastAttemptReason: "generation_race",
    });
    expect(peekRadarV2LoadDiagnostic()?.reason).toBe("generation_race");
    expect(radarV2ReasonFamily("session_not_active:market")).toBe("session_not_active");
  });

  it("does not console-log outside DEV (test / production stay silent)", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    recordRadarV2LoadDiagnostic({
      reason: "radar_v2_fetch_error",
      source: "fallback",
      session: "after-hours",
      attempts: 1,
      generationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      declaredCandidateCount: 118,
      lastAttemptReason: "radar_v2_fetch_error",
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("enables the debug surface only for radarDebug=1", () => {
    expect(isRadarDebugEnabled(null)).toBe(false);
    expect(isRadarDebugEnabled("")).toBe(false);
    expect(isRadarDebugEnabled("tab=day_trade_radar")).toBe(false);
    expect(isRadarDebugEnabled("radarDebug=true")).toBe(false);
    expect(isRadarDebugEnabled("radarDebug=0")).toBe(false);
    expect(isRadarDebugEnabled("radarDebug=")).toBe(false);
    expect(isRadarDebugEnabled("radarDebug=1")).toBe(true);
    expect(isRadarDebugEnabled("?radarDebug=1")).toBe(true);
    expect(isRadarDebugEnabled(new URLSearchParams("radarDebug=1"))).toBe(true);
    expect(isRadarDebugEnabled(new URLSearchParams("radarDebug=true"))).toBe(false);
  });
});
