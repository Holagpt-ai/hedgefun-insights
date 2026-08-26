import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CatalystWatchList } from "@/components/pre-market/CatalystWatchList";
import type { PreMarketCatalyst } from "@/types/pre-market";

function cat(overrides: Partial<PreMarketCatalyst>): PreMarketCatalyst {
  return {
    id: "1",
    symbol: "AAA",
    company_name: null,
    provider: "polygon",
    verification_state: "provider_reported",
    event_type: "company_news",
    event_date: "2026-08-26",
    event_time: "2026-08-26T10:00:00.000Z",
    time_of_day: null,
    title: "Chipmakers announce partnership",
    source_name: "Wire",
    source_url: "https://example.com/chips",
    published_at: "2026-08-26T10:00:00.000Z",
    ...overrides,
  };
}

describe("CatalystWatchList exact-url grouping", () => {
  it("renders one story card with affected symbols for a shared source_url", () => {
    render(
      <MemoryRouter>
        <CatalystWatchList
          etDate="2026-08-26"
          rows={[
            cat({ id: "1", symbol: "AMD" }),
            cat({ id: "2", symbol: "AVGO" }),
            cat({ id: "3", symbol: "NVDA" }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Chipmakers announce partnership")).toHaveLength(1);
    expect(screen.getByText(/Affected:/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "AMD" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "AVGO" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "NVDA" })).toBeTruthy();
  });

  it("does not group different URLs even when titles match", () => {
    render(
      <MemoryRouter>
        <CatalystWatchList
          etDate="2026-08-26"
          rows={[
            cat({ id: "1", symbol: "AAA", source_url: "https://a.example/1", title: "Same looking title" }),
            cat({ id: "2", symbol: "BBB", source_url: "https://b.example/1", title: "Same looking title" }),
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("Same looking title")).toHaveLength(2);
    expect(screen.queryByText(/Affected:/)).toBeNull();
  });

  it("defaults to Top 3 stories after grouping and View All restores the rest", () => {
    const rows = [
      cat({ id: "1", symbol: "AMD", source_url: "https://example.com/a" }),
      cat({ id: "2", symbol: "AVGO", source_url: "https://example.com/a" }),
      cat({ id: "3", symbol: "BBB", source_url: "https://example.com/b", title: "Story B" }),
      cat({ id: "4", symbol: "CCC", source_url: "https://example.com/c", title: "Story C" }),
      cat({ id: "5", symbol: "DDD", source_url: "https://example.com/d", title: "Story D" }),
    ];
    render(
      <MemoryRouter>
        <CatalystWatchList etDate="2026-08-26" rows={rows} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "View All (4)" })).toBeTruthy();
    expect(screen.queryByText("Story D")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View All (4)" }));
    expect(screen.getByText("Story D")).toBeTruthy();
  });
});
