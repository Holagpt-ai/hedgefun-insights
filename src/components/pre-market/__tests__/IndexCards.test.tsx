import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IndexCards } from "@/components/pre-market/IndexCards";
import type { PreMarketIndex } from "@/types/pre-market";

function idx(symbol: string, change: number, value: number): PreMarketIndex {
  return {
    symbol,
    status: "available",
    name: symbol,
    value,
    change_percent: change,
    change_amount: 1,
    updated_at: "2026-08-26T12:00:00.000Z",
    stale: false,
  };
}

describe("Market Pulse compactness", () => {
  it("renders symbols and percents in a single strip", () => {
    render(
      <IndexCards
        rows={[
          idx("SPY", -0.26, 560.12),
          idx("QQQ", -1.06, 470.5),
          idx("DIA", 0.25, 390.1),
          idx("IWM", -0.4, 210.4),
        ]}
      />,
    );
    expect(screen.getByText("SPY")).toBeTruthy();
    expect(screen.getByText("-0.26%")).toBeTruthy();
    expect(screen.getByText("QQQ")).toBeTruthy();
    expect(screen.getByText("-1.06%")).toBeTruthy();
    expect(screen.getByText("DIA")).toBeTruthy();
    expect(screen.getByText("+0.25%")).toBeTruthy();
    expect(screen.getByText("IWM")).toBeTruthy();
    expect(screen.getByText("-0.40%")).toBeTruthy();
  });
});
