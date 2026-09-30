import { describe, expect, it, vi, afterEach } from "vitest";
import * as lateSessionView from "@/lib/am-inbox/am-inbox-late-session-view";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LateSessionHandoffsList } from "@/components/pre-market/LateSessionHandoffsList";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";

function makePriorityCandidates(count: number): AmInboxLateSessionCandidate[] {
  return Array.from({ length: count }, (_, i) => {
    const symbol = `PRI${String(i).padStart(2, "0")}`;
    const ctx = buildLateSessionContinuationContext({
      symbol,
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: (count - i) * 2_000_000,
      rvol: 10 + count - i,
      dollarVolume: 80_000_000,
    });
    return {
      context: ctx,
      workflow: null,
      sourceCategories: ["POWER_HOUR_MOMENTUM"],
    };
  });
}

function makeQualifiedNonPriority(): AmInboxLateSessionCandidate {
  const ctx = buildLateSessionContinuationContext({
    symbol: "QUALONLY",
    sourceSessionDate: "2026-09-21",
    sourceTimestamp: "2026-09-21T20:00:00.000Z",
    sourceCategory: "STRONG_CLOSE_NEAR_HOD",
    volume: 400_000,
    rvol: 0.2,
    dollarVolume: null,
    closeDistanceFromHodPct: null,
  });
  return {
    context: ctx,
    workflow: null,
    sourceCategories: ["STRONG_CLOSE_NEAR_HOD"],
  };
}

describe("LateSessionHandoffsList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("caps default cards to priority names and View All exposes qualified pool", () => {
    vi.spyOn(lateSessionView, "isLateSessionPriorityCandidate").mockImplementation(
      (entry) => entry.context.symbol.startsWith("PRI"),
    );
    const priority = makePriorityCandidates(11);
    const qualifiedOnly = makeQualifiedNonPriority();
    const qualifiedCandidates = [...priority, qualifiedOnly];

    render(
      <MemoryRouter>
        <LateSessionHandoffsList
          candidates={priority}
          qualifiedCandidates={qualifiedCandidates}
          visibleLimit={6}
          funnel={{
            detectedCount: 407,
            qualifiedCount: 42,
            priorityCount: 11,
            displayedCount: 6,
          }}
        />
      </MemoryRouter>,
    );

    const list = screen.getByTestId("am-inbox-late-session-handoffs");
    expect(within(list).getAllByText(/^PRI\d{2}$/).length).toBe(6);
    expect(
      screen.getByText(/407 detected · 42 qualified · 11 priority · Showing top 6/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "View All (12)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View All (12)" }));
    expect(within(list).getAllByText(/^PRI\d{2}$/).length).toBe(11);
    expect(screen.getByText("QUALONLY")).toBeTruthy();
    expect(screen.getByText("Qualified · not priority")).toBeTruthy();
  });

  it("shows only two cards when two priority names exist and limit is six", () => {
    const priority = makePriorityCandidates(2);
    render(
      <MemoryRouter>
        <LateSessionHandoffsList
          candidates={priority}
          qualifiedCandidates={priority}
          visibleLimit={6}
          funnel={{
            detectedCount: 407,
            qualifiedCount: 42,
            priorityCount: 2,
            displayedCount: 2,
          }}
        />
      </MemoryRouter>,
    );

    const list = screen.getByTestId("am-inbox-late-session-handoffs");
    expect(within(list).getAllByText(/^PRI\d{2}$/).length).toBe(2);
    expect(screen.queryByText(/Showing top/)).toBeNull();
    expect(screen.queryByRole("button", { name: /View All/ })).toBeNull();
  });

  it("keeps symbol workflow actions on each card", () => {
    const candidates = makePriorityCandidates(1);
    render(
      <MemoryRouter>
        <LateSessionHandoffsList candidates={candidates} qualifiedCandidates={candidates} />
      </MemoryRouter>,
    );
    expect(screen.getByText("PRI00")).toBeTruthy();
  });
});
