import { describe, expect, it } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LateSessionHandoffsList } from "@/components/pre-market/LateSessionHandoffsList";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";

function makeCandidates(count: number): AmInboxLateSessionCandidate[] {
  return Array.from({ length: count }, (_, i) => {
    const symbol = `SYM${String(i).padStart(2, "0")}`;
    const ctx = buildLateSessionContinuationContext({
      symbol,
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: (count - i) * 1_000_000,
      rvol: count - i,
    });
    return {
      context: ctx,
      workflow: null,
      sourceCategories: ["POWER_HOUR_MOMENTUM"],
    };
  });
}

describe("LateSessionHandoffsList", () => {
  it("caps visible cards on the main AM Inbox and exposes View All for the full set", () => {
    const candidates = makeCandidates(65);
    render(
      <MemoryRouter>
        <LateSessionHandoffsList candidates={candidates} visibleLimit={6} />
      </MemoryRouter>,
    );

    const list = screen.getByTestId("am-inbox-late-session-handoffs");
    expect(within(list).getAllByText(/^SYM\d{2}$/).length).toBe(6);
    expect(screen.getByText(/Showing 6 of 65 priority continuation candidates/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "View All (65)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View All (65)" }));
    expect(within(list).getAllByText(/^SYM\d{2}$/).length).toBe(65);
  });

  it("keeps symbol workflow actions on each card", () => {
    const candidates = makeCandidates(1);
    render(
      <MemoryRouter>
        <LateSessionHandoffsList candidates={candidates} />
      </MemoryRouter>,
    );
    expect(screen.getByText("SYM00")).toBeTruthy();
  });
});
