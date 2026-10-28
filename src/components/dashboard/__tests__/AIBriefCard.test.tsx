import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvailableBrief } from "@/components/dashboard/AIBriefCard";

describe("AI Pre-Market Brief presentation", () => {
  it("renders markdown without raw heading markers and shows the evidence cutoff", () => {
    render(
      <AvailableBrief
        content={"**PRE-OPEN BRIEF**\n\nMarkets were mixed. SPY slipped into the bell."}
        previousTradingDay={false}
        briefDateDisplay={null}
        evidenceCutoff="2026-08-27T12:00:00.000Z"
        expanded
        onToggle={() => {}}
      />,
    );
    expect(screen.getByTestId("evidence-cutoff").textContent).toMatch(/Evidence through/);
    expect(screen.queryByText("**PRE-OPEN BRIEF**")).toBeNull();
    expect(screen.getByText("PRE-OPEN BRIEF")).toBeTruthy();
  });

  it("shows a freshness notice for stale early-session briefs", () => {
    render(
      <AvailableBrief
        content={"**PRE-OPEN BRIEF**\n\nMarkets were flat overnight."}
        previousTradingDay={false}
        briefDateDisplay={null}
        evidenceCutoff="2026-09-14T08:14:00.000Z"
        freshnessState="stale"
        generationWindow="early"
        expanded
        onToggle={() => {}}
      />,
    );
    expect(screen.getByTestId("freshness-notice").textContent).toMatch(/newer update is expected/);
  });

  it("collapsed preview ends on a complete sentence when possible", () => {
    const content =
      "Futures were softer into the open. Mega-cap tech led decliners while energy held bid. " +
      "The desk watches CPI and earnings after the bell.";
    render(
      <AvailableBrief
        content={content}
        previousTradingDay={false}
        briefDateDisplay={null}
        evidenceCutoff={null}
        expanded={false}
        onToggle={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "Expand AI brief" });
    expect(button).toBeTruthy();
    expect(screen.getByText(/Futures were softer into the open\./)).toBeTruthy();
    expect(screen.queryByText(/after the bell/)).toBeNull();
  });

  it("keeps the full server brief behind an accessible expand control", () => {
    const content =
      "SPY slipped 0.3 percent. QQQ lagged the tape. IWM held up. DIA was mixed into the bell with no extra color.";
    render(
      <AvailableBrief
        content={content}
        previousTradingDay={false}
        briefDateDisplay={null}
        evidenceCutoff={null}
        expanded={false}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Expand AI brief" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
