import { describe, expect, it, beforeEach } from "vitest";
import {
  peekRadarV2LoadDiagnostic,
  radarV2ReasonFamily,
  recordRadarV2LoadDiagnostic,
  resetRadarV2LoadDiagnostic,
  RADAR_V2_DECISION_REASONS,
} from "@/lib/screeners/radar-v2-diagnostics";

describe("Radar V2 load diagnostics (D11)", () => {
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
});
