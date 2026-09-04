import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RadarDebugPanel } from "@/features/day-trade-radar-v2/RadarDebugPanel";
import type { RadarV2LoadDiagnostic } from "@/lib/screeners/radar-v2-diagnostics";

const FALLBACK: RadarV2LoadDiagnostic = {
  reason: "radar_v2_fetch_error",
  source: "fallback",
  session: "after-hours",
  attempts: 1,
  generationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  declaredCandidateCount: 118,
  lastAttemptReason: "radar_v2_fetch_error",
};

const AVAILABLE: RadarV2LoadDiagnostic = {
  reason: "radar_v2_available",
  source: "radar-v2",
  session: "after-hours",
  attempts: 1,
  generationId: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  declaredCandidateCount: 118,
  lastAttemptReason: null,
};

describe("RadarDebugPanel (D15)", () => {
  it("renders fallback reason fields", () => {
    render(
      <RadarDebugPanel diagnostic={FALLBACK} syncedAt="2026-09-04T20:35:00.000Z" />,
    );
    const block = screen.getByTestId("radar-debug");
    expect(block).toHaveTextContent("RADAR DEBUG");
    expect(block).toHaveTextContent("source: fallback");
    expect(block).toHaveTextContent("reason: radar_v2_fetch_error");
    expect(block).toHaveTextContent("session: after-hours");
    expect(block).toHaveTextContent("attempts: 1");
    expect(block).toHaveTextContent("generation: aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(block).toHaveTextContent("declared: 118");
    expect(block).toHaveTextContent("lastAttempt: radar_v2_fetch_error");
    expect(block).toHaveTextContent("synced: 2026-09-04T20:35:00.000Z");
  });

  it("renders radar-v2 available reason fields", () => {
    render(<RadarDebugPanel diagnostic={AVAILABLE} />);
    const block = screen.getByTestId("radar-debug");
    expect(block).toHaveTextContent("source: radar-v2");
    expect(block).toHaveTextContent("reason: radar_v2_available");
    expect(block).toHaveTextContent("lastAttempt: —");
    expect(block).not.toHaveTextContent("synced:");
  });

  it("does not render secrets, tokens, credentials, or raw rows", () => {
    render(<RadarDebugPanel diagnostic={FALLBACK} syncedAt="2026-09-04T20:35:00.000Z" />);
    const text = screen.getByTestId("radar-debug").textContent ?? "";
    expect(text).not.toMatch(/service_role|anon_key|eyJ|sbp_|supabase/i);
    expect(text).not.toMatch(/Authorization|Bearer|apikey/i);
    expect(text).not.toContain("AAPL");
    expect(text).not.toContain("IMRN");
    expect(text).not.toContain("[");
    expect(text).not.toContain("{");
  });
});
