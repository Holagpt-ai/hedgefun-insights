import { describe, it, expect } from "vitest";
import {
  classifyCatalystPresentation,
  catalystPresentationLabel,
  isCatalystPresentedToday,
} from "@/lib/pre-market/catalyst-presentation";
import type { CatalystPresentationInput } from "@/lib/pre-market/catalyst-presentation";

function row(overrides: Partial<CatalystPresentationInput> = {}): CatalystPresentationInput {
  return {
    title: "Company reports quarterly results",
    provider: "polygon",
    event_type: "company_news",
    event_date: "2026-08-28",
    event_time: "2026-08-28T12:00:00.000Z",
    published_at: "2026-08-28T12:00:00.000Z",
    source_name: "Wire",
    attribution_class: "direct",
    ticker_specific: true,
    ...overrides,
  };
}

describe("classifyCatalystPresentation", () => {
  it("does not label editorial comparison articles as Direct catalyst", () => {
    expect(
      catalystPresentationLabel(
        row({
          title: "CBRS vs. AMD: Which Stock Leads the AI Infrastructure Boom?",
          attribution_class: "direct",
          ticker_specific: true,
        }),
      ),
    ).toBe("Commentary");
  });

  it("labels still-a-buy question articles as Commentary", () => {
    expect(
      catalystPresentationLabel(
        row({
          title: "Up Nearly 30% in August, Is SpaceX Stock Still a Buy?",
          attribution_class: "direct",
          ticker_specific: true,
        }),
      ),
    ).toBe("Commentary");
  });

  it("labels class-action solicitations as Legal / shareholder notice", () => {
    expect(
      catalystPresentationLabel(
        row({
          title: "WIX Class Action: Law Firm Reminds Investors of Losses",
          attribution_class: "direct",
          ticker_specific: true,
        }),
      ),
    ).toBe("Legal / shareholder notice");
  });

  it("does not treat provider association alone as Direct catalyst", () => {
    expect(
      classifyCatalystPresentation(
        row({
          title: "Analyst notes on the semiconductor group",
          attribution_class: "provider_associated",
          ticker_specific: true,
        }),
      ),
    ).toBe("provider_associated");
  });

  it("keeps sector-related attribution as Sector related", () => {
    expect(
      catalystPresentationLabel(
        row({
          title: "EV makers rally after policy shift",
          attribution_class: "sector_related",
          ticker_specific: false,
        }),
      ),
    ).toBe("Sector related");
  });

  it("shows Direct catalyst only with ticker-specific direct evidence", () => {
    expect(
      catalystPresentationLabel(
        row({
          title: "NVIDIA announces next-generation data center GPU",
          attribution_class: "direct",
          ticker_specific: true,
        }),
      ),
    ).toBe("Direct catalyst");
  });

  it("does not show Direct catalyst when ticker_specific is missing", () => {
    expect(
      classifyCatalystPresentation(
        row({
          title: "NVIDIA announces next-generation data center GPU",
          attribution_class: "direct",
          ticker_specific: undefined,
        }),
      ),
    ).toBe("provider_associated");
  });

  it("keeps earnings-calendar records as Direct catalyst", () => {
    expect(
      classifyCatalystPresentation(
        row({
          title: "AAPL reports before the open",
          provider: "earnings_calendar",
          event_type: "earnings",
          attribution_class: "direct",
          ticker_specific: true,
        }),
      ),
    ).toBe("direct_catalyst");
  });
});

describe("isCatalystPresentedToday", () => {
  it("does not label an Aug 27 ET article as Today on Aug 28 from a UTC date", () => {
    const news = row({
      event_date: "2026-08-28",
      event_time: "2026-08-28T00:48:00.000Z",
      published_at: "2026-08-28T00:48:00.000Z",
    });
    expect(isCatalystPresentedToday(news, "2026-08-28")).toBe(false);
    expect(isCatalystPresentedToday(news, "2026-08-27")).toBe(true);
  });

  it("uses published_at when event_time is missing", () => {
    const news = row({
      event_date: "2026-08-28",
      event_time: null,
      published_at: "2026-08-28T03:59:00.000Z",
    });
    expect(isCatalystPresentedToday(news, "2026-08-28")).toBe(false);
    expect(isCatalystPresentedToday(news, "2026-08-27")).toBe(true);
  });

  it("falls back to event_date only when timestamp evidence is unavailable", () => {
    const news = row({
      event_date: "2026-08-28",
      event_time: null,
      published_at: null,
    });
    expect(isCatalystPresentedToday(news, "2026-08-28")).toBe(true);
  });

  it("keeps earnings-calendar Today on the scheduled event_date", () => {
    const earnings = row({
      provider: "earnings_calendar",
      event_type: "earnings",
      event_date: "2026-08-28",
      event_time: "2026-08-28T00:48:00.000Z",
      published_at: "2026-08-27T20:00:00.000Z",
    });
    expect(isCatalystPresentedToday(earnings, "2026-08-28")).toBe(true);
    expect(isCatalystPresentedToday(earnings, "2026-08-27")).toBe(false);
  });
});
