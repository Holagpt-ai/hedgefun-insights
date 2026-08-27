import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CollapsibleCommentary } from "@/components/pre-market/CollapsibleCommentary";

describe("CollapsibleCommentary", () => {
  it("strips raw markdown markers so they are not visible", () => {
    render(
      <CollapsibleCommentary
        text="**PRE-OPEN BRIEF** Markets were mixed into the bell with no verified catalyst."
        label="AI read for AAPL"
      />,
    );
    expect(screen.queryByText(/\*\*PRE-OPEN BRIEF\*\*/)).toBeNull();
    expect(screen.getByText(/PRE-OPEN BRIEF/)).toBeTruthy();
  });

  it("collapses longer commentary behind an accessible expand control", () => {
    const text =
      "Price held above VWAP into the cash open. Volume was elevated versus the prior session. No verified ticker-specific catalyst available. Range remained inside yesterday's high.";
    render(<CollapsibleCommentary text={text} label="AI read for AAPL" />);
    const expand = screen.getByRole("button", { name: "Expand AI read for AAPL" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(expand);
    expect(screen.getByRole("button", { name: "Collapse AI read for AAPL" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText(/Range remained inside/)).toBeTruthy();
  });
});
