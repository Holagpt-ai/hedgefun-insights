import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RiskAttentionList } from "@/components/pre-market/RiskAttentionList";
import type { PreMarketAttentionItem } from "@/types/pre-market";

function item(overrides: Partial<PreMarketAttentionItem>): PreMarketAttentionItem {
  return {
    id: "1",
    symbol: "GRAB",
    kind: "bearish_signal",
    label: "Bearish market signal",
    detail: "Lost prior close",
    route: "/dashboard/watchlist?symbol=GRAB",
    ...overrides,
  };
}

describe("RiskAttentionList ticker rollup", () => {
  it("renders one card per ticker with all supplied details", () => {
    render(
      <MemoryRouter>
        <RiskAttentionList
          items={[
            item({ id: "1", detail: "Lost prior close" }),
            item({ id: "2", detail: "Broke premarket low" }),
            item({
              id: "pending",
              symbol: null,
              kind: "awaiting_refresh",
              label: "Analysis awaiting refresh",
              detail: "12 symbols waiting",
              route: "/dashboard/watchlist",
            }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("GRAB")).toBeTruthy();
    expect(screen.getByText("Bearish market signal — Lost prior close")).toBeTruthy();
    expect(screen.getByText("Bearish market signal — Broke premarket low")).toBeTruthy();
    expect(screen.getByText("Analysis awaiting refresh")).toBeTruthy();
    expect(screen.queryByText(/deterioration/i)).toBeNull();
  });

  it("keeps alert history behind an accessible secondary path", () => {
    render(
      <MemoryRouter>
        <RiskAttentionList
          items={[item({ id: "current", event_time: "2026-08-27T11:00:00.000Z", source: "deterministic" })]}
          history={[
            item({ id: "old", detail: "Price below VWAP", event_time: "2026-08-27T08:00:00.000Z" }),
            item({ id: "current", event_time: "2026-08-27T11:00:00.000Z" }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "View alert history" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "View alert history" }));
    expect(screen.getByRole("button", { name: "Hide alert history" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByText(/Price below VWAP/)).toBeTruthy();
  });
});
