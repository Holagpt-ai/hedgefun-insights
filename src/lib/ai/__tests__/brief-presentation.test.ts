import { describe, expect, it } from "vitest";
import { briefAccessState, isInsufficientBriefReason, presentStoredBriefFailure } from "@/lib/ai/brief-presentation";

describe("brief reader states", () => {
  it("keeps Pro gating on 403 and does not treat it as a brief", () => {
    expect(briefAccessState(403)).toBe("upgrade");
    expect(briefAccessState(401)).toBe("unauth");
  });

  it("maps provider 5xx to temporarily unavailable", () => {
    expect(briefAccessState(502)).toBe("temporarily_unavailable");
    expect(briefAccessState(503)).toBe("temporarily_unavailable");
  });

  it("maps stale or missing source reasons to insufficient evidence", () => {
    expect(isInsufficientBriefReason("source_stale")).toBe(true);
    expect(isInsufficientBriefReason("source_missing_symbol")).toBe(true);
    expect(isInsufficientBriefReason("insufficient_evidence")).toBe(true);
    expect(isInsufficientBriefReason("brief_not_ready")).toBe(false);
  });

  it("renders a persisted failure instead of Generating", () => {
    const retryable = presentStoredBriefFailure({
      reason: "temporarily_unavailable",
      generationStatus: "temporarily_unavailable",
      retryable: true,
    });
    expect(retryable?.statusLabel).toBe("Retrying soon");
    expect(retryable?.message).toContain("generation failed");
    expect(retryable?.retryControl).toBe(true);
    const auth = presentStoredBriefFailure({
      reason: "temporarily_unavailable",
      generationStatus: "temporarily_unavailable",
      retryable: false,
    });
    expect(auth?.retryControl).toBe(false);
    expect(auth?.refreshable).toBe(false);
    const evidence = presentStoredBriefFailure({
      reason: "insufficient_evidence",
      generationStatus: "insufficient_evidence",
      retryable: false,
    });
    expect(evidence?.statusLabel).toBe("Insufficient evidence");
    expect(evidence?.retryControl).toBe(false);
    expect(evidence?.message).not.toMatch(/sk-ant|provider error/i);
    expect(presentStoredBriefFailure({ reason: "brief_not_ready", generationStatus: "generating" })).toBeNull();
  });
});
