import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  classifyCatalystPresentation,
  catalystPresentationLabel,
  isCatalystPresentedToday,
  type CatalystPresentationInput,
} from "./catalyst-presentation.ts";

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

Deno.test("parity: editorial comparison is Commentary, not Direct catalyst", () => {
  assertEquals(
    catalystPresentationLabel(
      row({
        title: "CBRS vs. AMD: Which Stock Leads the AI Infrastructure Boom?",
        attribution_class: "direct",
        ticker_specific: true,
      }),
    ),
    "Commentary",
  );
});

Deno.test("parity: still-a-buy question is Commentary", () => {
  assertEquals(
    catalystPresentationLabel(
      row({
        title: "Up Nearly 30% in August, Is SpaceX Stock Still a Buy?",
        attribution_class: "direct",
        ticker_specific: true,
      }),
    ),
    "Commentary",
  );
});

Deno.test("parity: class-action solicitation is Legal / shareholder notice", () => {
  assertEquals(
    catalystPresentationLabel(
      row({
        title: "WIX Class Action: Law Firm Reminds Investors of Losses",
        attribution_class: "direct",
        ticker_specific: true,
      }),
    ),
    "Legal / shareholder notice",
  );
});

Deno.test("parity: provider association alone is not Direct catalyst", () => {
  assertEquals(
    classifyCatalystPresentation(
      row({
        title: "Analyst notes on the semiconductor group",
        attribution_class: "provider_associated",
        ticker_specific: true,
      }),
    ),
    "provider_associated",
  );
});

Deno.test("parity: sector-related stays Sector related", () => {
  assertEquals(
    catalystPresentationLabel(
      row({
        title: "EV makers rally after policy shift",
        attribution_class: "sector_related",
        ticker_specific: false,
      }),
    ),
    "Sector related",
  );
});

Deno.test("parity: Direct catalyst requires ticker-specific direct evidence", () => {
  assertEquals(
    catalystPresentationLabel(
      row({
        title: "NVIDIA announces next-generation data center GPU",
        attribution_class: "direct",
        ticker_specific: true,
      }),
    ),
    "Direct catalyst",
  );
  assertEquals(
    classifyCatalystPresentation(
      row({
        title: "NVIDIA announces next-generation data center GPU",
        attribution_class: "direct",
        ticker_specific: undefined,
      }),
    ),
    "provider_associated",
  );
});

Deno.test("parity: earnings-calendar records remain Direct catalyst", () => {
  assertEquals(
    classifyCatalystPresentation(
      row({
        title: "AAPL reports before the open",
        provider: "earnings_calendar",
        event_type: "earnings",
        attribution_class: "direct",
        ticker_specific: true,
      }),
    ),
    "direct_catalyst",
  );
});

Deno.test("parity: Today uses ET calendar date, not UTC date", () => {
  const news = row({
    event_date: "2026-08-28",
    event_time: "2026-08-28T00:48:00.000Z",
    published_at: "2026-08-28T00:48:00.000Z",
  });
  assertEquals(isCatalystPresentedToday(news, "2026-08-28"), false);
  assertEquals(isCatalystPresentedToday(news, "2026-08-27"), true);
});

Deno.test("parity: published_at used when event_time missing", () => {
  const news = row({
    event_date: "2026-08-28",
    event_time: null,
    published_at: "2026-08-28T03:59:00.000Z",
  });
  assertEquals(isCatalystPresentedToday(news, "2026-08-28"), false);
  assertEquals(isCatalystPresentedToday(news, "2026-08-27"), true);
});

Deno.test("parity: earnings-calendar Today stays on scheduled event_date", () => {
  const earnings = row({
    provider: "earnings_calendar",
    event_type: "earnings",
    event_date: "2026-08-28",
    event_time: "2026-08-28T00:48:00.000Z",
    published_at: "2026-08-27T20:00:00.000Z",
  });
  assertEquals(isCatalystPresentedToday(earnings, "2026-08-28"), true);
  assertEquals(isCatalystPresentedToday(earnings, "2026-08-27"), false);
});
