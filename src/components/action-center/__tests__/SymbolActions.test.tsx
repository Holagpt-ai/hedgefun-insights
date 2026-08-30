import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SymbolActions } from "@/components/action-center/SymbolActions";
import { ActionFeed } from "@/components/action-center/ActionFeed";
import type { ActionFeedItem } from "@/types/action-center";

function renderActions(symbol: string, extras?: { showWatchlist?: boolean; showChart?: boolean }) {
  return render(
    <MemoryRouter>
      <SymbolActions symbol={symbol} showWatchlist={extras?.showWatchlist} showChart={extras?.showChart} />
    </MemoryRouter>,
  );
}

describe("Action Center SymbolActions handoffs", () => {
  it("Watchlist keeps the normalized ticker in the query", () => {
    renderActions("AAPL", { showWatchlist: true });
    const link = screen.getByRole("link", { name: "Open Watchlist for AAPL" }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/dashboard/watchlist?symbol=AAPL");
  });

  it("uppercases a lowercase ticker before building routes", () => {
    renderActions("aapl", { showWatchlist: true, showChart: true });
    expect(
      (screen.getByRole("link", { name: "Open Watchlist for AAPL" }) as HTMLAnchorElement).getAttribute("href"),
    ).toBe("/dashboard/watchlist?symbol=AAPL");
    expect(
      (screen.getByRole("link", { name: "View AAPL chart" }) as HTMLAnchorElement).getAttribute("href"),
    ).toBe("/chart/AAPL");
  });

  it("Chart CTA uses /chart/{SYMBOL}, not stock detail", () => {
    renderActions("AAPL", { showChart: true });
    const chart = screen.getByRole("link", { name: "View AAPL chart" }) as HTMLAnchorElement;
    expect(chart.getAttribute("href")).toBe("/chart/AAPL");
    expect(chart.getAttribute("href")).not.toMatch(/^\/stocks\//);
  });

  it("does not invent a Watchlist ticker for an invalid symbol", () => {
    renderActions("<script>", { showWatchlist: true, showChart: true });
    expect(screen.queryByRole("link", { name: /watchlist/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /chart/i })).toBeNull();
  });
});

describe("Action Feed ticker rows", () => {
  it("watchlist alerts pass ?symbol= through Watchlist", () => {
    const item: ActionFeedItem = {
      key: "aapl-alert",
      bucket: "now",
      source: "watchlist_alert",
      symbol: "aapl",
      title: "Alert",
      detail: null,
      timestampMs: 0,
      timestampLabel: "now",
      sourceLabel: "Watchlist",
    };
    render(
      <MemoryRouter>
        <ActionFeed items={[item]} />
      </MemoryRouter>,
    );
    expect(
      (screen.getByRole("link", { name: "Open Watchlist for AAPL" }) as HTMLAnchorElement).getAttribute("href"),
    ).toBe("/dashboard/watchlist?symbol=AAPL");
    expect(
      (screen.getByRole("link", { name: "View AAPL chart" }) as HTMLAnchorElement).getAttribute("href"),
    ).toBe("/chart/AAPL");
  });
});
