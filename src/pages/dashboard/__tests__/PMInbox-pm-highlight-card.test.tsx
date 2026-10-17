import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PmSessionSummaryCard } from "@/pages/dashboard/PMInbox";
import type { PmSessionSummaryRow } from "@/lib/inbox/pm-session-summary";

vi.mock("@/lib/historical-workflow/workflow-symbol-routes", () => ({
  buildInboxWorkflowNavigatePath: () => null,
}));

function sampleRow(over: Partial<PmSessionSummaryRow> = {}): PmSessionSummaryRow {
  return {
    symbol: "AAA",
    rank: 1,
    volume: 1_000_000,
    primaryEvent: "RUNNING_UP",
    primaryEventLabel: "Running Up",
    observationTimeEt: "3:45 PM ET",
    sourceTradingSession: "2026-03-16",
    freshness: "late_confirmed",
    freshnessLabel: "Late-session recorded",
    rvol5m: null,
    volumeVelocity: null,
    distanceFromHodPct: null,
    participationNote: null,
    ...over,
  };
}

describe("PmSessionSummaryCard", () => {
  it("renders preserved same-session copy without prior session wording", () => {
    render(
      <MemoryRouter>
        <PmSessionSummaryCard
          row={sampleRow({
            freshness: "late_confirmed",
            freshnessLabel: "Late-session recorded · preserved · not live",
          })}
        />
      </MemoryRouter>,
    );
    const text = screen.getByTestId("pm-highlight-AAA").textContent ?? "";
    expect(text).toContain("preserved · not live");
    expect(text).not.toContain("Prior session");
  });

  it("shows prior session label only for prior-session evidence rows", () => {
    render(
      <MemoryRouter>
        <PmSessionSummaryCard
          row={sampleRow({
            freshness: "prior_session_snapshot",
            freshnessLabel: "Prior session snapshot",
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("pm-highlight-AAA").textContent).toContain("Prior session snapshot");
  });

  it("does not duplicate ET in observation time display", () => {
    render(
      <MemoryRouter>
        <PmSessionSummaryCard row={sampleRow()} />
      </MemoryRouter>,
    );
    const detail = screen.getByTestId("pm-highlight-AAA").querySelector(".text-xs");
    expect(detail?.textContent).toContain("3:45 PM ET");
    expect(detail?.textContent).not.toMatch(/ET ET/);
  });
});
