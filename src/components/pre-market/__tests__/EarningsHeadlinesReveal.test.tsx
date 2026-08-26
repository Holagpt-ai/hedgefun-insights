import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EarningsList } from "@/components/pre-market/EarningsList";
import { HeadlinesList } from "@/components/pre-market/HeadlinesList";
import type { PreMarketEarnings, PreMarketHeadline } from "@/types/pre-market";

function earn(symbol: string, id: string): PreMarketEarnings {
  return {
    id,
    symbol,
    company_name: null,
    provider: "earnings_calendar",
    verification_state: "provider_reported",
    event_type: "earnings",
    event_date: "2026-08-26",
    time_of_day: "before_open",
    title: `${symbol} earnings`,
    estimate_eps: 1.1,
    actual_eps: null,
    surprise_percent: null,
    source_name: "Calendar",
    source_url: null,
    updated_at: "2026-08-26T10:00:00.000Z",
    published_at: null,
  };
}

function headline(id: string, text: string): PreMarketHeadline {
  return {
    id,
    headline: text,
    source: "Wire",
    url: `https://example.com/${id}`,
    published_at: "2026-08-26T10:00:00.000Z",
  };
}

describe("earnings and headlines Top-3", () => {
  it("shows the first three earnings and View All for the rest", () => {
    render(
      <MemoryRouter>
        <EarningsList
          rows={[earn("AAA", "1"), earn("BBB", "2"), earn("CCC", "3"), earn("DDD", "4")]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("AAA earnings")).toBeTruthy();
    expect(screen.getByText("CCC earnings")).toBeTruthy();
    expect(screen.queryByText("DDD earnings")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View All (4)" }));
    expect(screen.getByText("DDD earnings")).toBeTruthy();
  });

  it("shows three headlines by default", () => {
    render(
      <HeadlinesList
        rows={[
          headline("1", "First"),
          headline("2", "Second"),
          headline("3", "Third"),
          headline("4", "Fourth"),
        ]}
      />,
    );
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.queryByText("Fourth")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View All (4)" }));
    expect(screen.getByText("Fourth")).toBeTruthy();
  });
});
