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

  it("renders a compact system notice for aggregated data-health rows", () => {
    render(
      <MemoryRouter>
        <RiskAttentionList
          items={[
            item({
              id: "system:data_unavailable:watchlist",
              symbol: null,
              kind: "data_unavailable",
              label: "Market data incomplete for 3 watchlist names",
              detail: "VRAX · SHAZ · NVVE",
              route: "/dashboard/watchlist",
              source: "system",
            }),
          ]}
          history={[
            item({ id: "vrax", symbol: "VRAX", kind: "data_unavailable", label: "Current market snapshot unavailable" }),
            item({ id: "shaz", symbol: "SHAZ", kind: "data_unavailable", label: "Not enough intraday bars" }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Market data incomplete for 3 watchlist names")).toBeTruthy();
    expect(screen.getByText("VRAX · SHAZ · NVVE")).toBeTruthy();
    expect(screen.getByRole("button", { name: "View alert history" })).toBeTruthy();
  });
});

describe("RiskAttentionList compression", () => {
  it("renders no reveal control for 0 items", () => {
    const { container } = render(
      <MemoryRouter>
        <RiskAttentionList items={[]} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /View \d+ more/i })).toBeNull();
    expect(container.querySelector("[class*='overflow-x-hidden']")).toBeTruthy();
  });

  it("renders 1–3 ticker groups without a reveal control", () => {
    render(
      <MemoryRouter>
        <RiskAttentionList
          items={[
            item({ id: "a", symbol: "AAA", label: "Flag A", detail: "one" }),
            item({ id: "b", symbol: "BBB", label: "Flag B", detail: "two" }),
            item({ id: "c", symbol: "CCC", label: "Flag C", detail: "three" }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("AAA")).toBeTruthy();
    expect(screen.getByText("CCC")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /View \d+ more/i })).toBeNull();
    expect(screen.queryByText(/total/)).toBeNull();
  });

  it("with exactly 4 groups shows 3 then View 1 more and 4 total", () => {
    render(
      <MemoryRouter>
        <RiskAttentionList
          items={[
            item({ id: "a", symbol: "AAA", label: "Flag A", detail: "one" }),
            item({ id: "b", symbol: "BBB", label: "Flag B", detail: "two" }),
            item({ id: "c", symbol: "CCC", label: "Flag C", detail: "three" }),
            item({ id: "d", symbol: "DDD", label: "Flag D", detail: "four" }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("AAA")).toBeTruthy();
    expect(screen.getByText("CCC")).toBeTruthy();
    expect(screen.queryByText("DDD")).toBeNull();
    expect(screen.getByText("4 total")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /View 1 more/i }));
    expect(screen.getByText("DDD")).toBeTruthy();
    expect(screen.getByText("4 total")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Show less/i }));
    expect(screen.queryByText("DDD")).toBeNull();
    expect(screen.getByRole("button", { name: /View 1 more/i })).toBeTruthy();
  });

  it("with many groups keeps the first three in delivered order", () => {
    const items = ["ZZZ", "MSTR", "AAPL", "MSFT", "NVDA", "AMD", "INTC", "TSM"].map((symbol, i) =>
      item({ id: String(i), symbol, label: `${symbol} flag`, detail: `d${i}` }),
    );
    render(
      <MemoryRouter>
        <RiskAttentionList items={items} />
      </MemoryRouter>,
    );
    expect(screen.getByText("ZZZ")).toBeTruthy();
    expect(screen.getByText("MSTR")).toBeTruthy();
    expect(screen.getByText("AAPL")).toBeTruthy();
    expect(screen.queryByText("MSFT")).toBeNull();
    expect(screen.getByText("8 total")).toBeTruthy();
    expect(screen.getByRole("button", { name: /View 5 more/i })).toBeTruthy();
  });

  it("counts ticker groups, not individual bullets, for Top 3", () => {
    render(
      <MemoryRouter>
        <RiskAttentionList
          items={[
            item({ id: "g1", symbol: "GRAB", detail: "Lost prior close" }),
            item({ id: "g2", symbol: "GRAB", detail: "Broke premarket low" }),
            item({ id: "g3", symbol: "GRAB", label: "Watchlist alert", detail: "Direction changed" }),
            item({ id: "b", symbol: "BBB", label: "Flag B", detail: "two" }),
            item({ id: "c", symbol: "CCC", label: "Flag C", detail: "three" }),
            item({ id: "d", symbol: "DDD", label: "Flag D", detail: "four" }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("GRAB")).toBeTruthy();
    expect(screen.getByText("Bearish market signal — Lost prior close")).toBeTruthy();
    expect(screen.getByText("Bearish market signal — Broke premarket low")).toBeTruthy();
    expect(screen.getByText("Watchlist alert — Direction changed")).toBeTruthy();
    expect(screen.getByText("BBB")).toBeTruthy();
    expect(screen.getByText("CCC")).toBeTruthy();
    expect(screen.queryByText("DDD")).toBeNull();
    expect(screen.getByRole("button", { name: /View 1 more/i })).toBeTruthy();
    expect(screen.getByText("4 total")).toBeTruthy();
  });

  it("keeps long copy wrapping and ticker labels in a bounded width container", () => {
    const { container } = render(
      <MemoryRouter>
        <RiskAttentionList
          items={[
            item({
              id: "long",
              symbol: "VRAX",
              label: "Current market snapshot unavailable",
              detail: "Waiting for fresh market data after a long premarket gap with no trades printing for this illiquid name",
            }),
            item({ id: "b", symbol: "BBB", label: "Flag B", detail: "two" }),
            item({ id: "c", symbol: "CCC", label: "Flag C", detail: "three" }),
            item({ id: "d", symbol: "DDD", label: "Flag D", detail: "four" }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("VRAX")).toBeTruthy();
    expect(container.querySelector(".overflow-x-hidden")).toBeTruthy();
    expect(container.querySelector(".break-words")).toBeTruthy();
    expect(container.querySelector(".min-w-0")).toBeTruthy();
    expect(screen.getByRole("button", { name: /View 1 more/i }).className).toMatch(/min-h-8/);
  });
});
