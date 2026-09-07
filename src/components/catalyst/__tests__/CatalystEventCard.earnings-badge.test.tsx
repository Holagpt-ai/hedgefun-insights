import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CatalystEventCard } from "@/components/catalyst/CatalystEventCard";
import type { CatalystEvent } from "@/types/catalyst";

function baseEvent(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "evt_earnings",
    dedupe_key: "dedupe_earnings",
    symbol: "AAPL",
    company_name: "Apple Inc.",
    event_type: "earnings",
    verification_state: "provider_reported",
    event_date: "2026-08-03",
    event_time: null,
    time_of_day: "after_close",
    title: "AAPL earnings",
    description: null,
    source_name: "Provider",
    source_url: null,
    provider: "provider",
    related_symbols: [],
    facts: {},
    published_at: null,
    ...overrides,
  };
}

function renderCard(event: CatalystEvent) {
  return render(
    <MemoryRouter>
      <CatalystEventCard
        event={event}
        isSaved={false}
        isReviewed={false}
        onToggleSaved={() => {}}
        onToggleReviewed={() => {}}
      />
    </MemoryRouter>,
  );
}

describe("CatalystEventCard earnings result badge", () => {
  it("shows BEAT when surprise_percent is positive", () => {
    renderCard(baseEvent({ facts: { surprise_percent: 7.3 } }));
    expect(screen.getByText("BEAT")).toBeInTheDocument();
    expect(screen.queryByText("MISS")).toBeNull();
  });

  it("shows MISS when surprise_percent is negative", () => {
    renderCard(baseEvent({ facts: { surprise_percent: -4.1 } }));
    expect(screen.getByText("MISS")).toBeInTheDocument();
    expect(screen.queryByText("BEAT")).toBeNull();
  });

  it("shows no result badge when outcome is not conclusive", () => {
    renderCard(baseEvent({ facts: { surprise_percent: 0 } }));
    expect(screen.queryByText("BEAT")).toBeNull();
    expect(screen.queryByText("MISS")).toBeNull();
  });

  it("shows EARNINGS DATA for earnings_calendar rows", () => {
    renderCard(baseEvent({ provider: "earnings_calendar" }));
    expect(screen.getByText("EARNINGS DATA")).toBeInTheDocument();
  });

  it("shows NEWS for polygon rows", () => {
    renderCard(baseEvent({ provider: "polygon" }));
    expect(screen.getByText("NEWS")).toBeInTheDocument();
  });

  it("hides source-class badge for unknown providers", () => {
    renderCard(baseEvent({ provider: "provider" }));
    expect(screen.queryByText("EARNINGS DATA")).toBeNull();
    expect(screen.queryByText("NEWS")).toBeNull();
  });
});
