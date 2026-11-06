import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CatalystDetailPanel } from "@/components/catalyst/CatalystDetailPanel";
import { CatalystEventRow } from "@/components/catalyst/CatalystEventRow";
import { attributeStory, attributeSymbol } from "@/lib/catalyst/attribution";
import { hydrateCatalystEventVerification } from "@/lib/catalyst/catalyst-event-verification";
import {
  compareCatalystFeedEvents,
  isHighSignalCatalystEvent,
} from "@/lib/catalyst/catalyst-discovery-priority";
import { catalystDisplayLabelFromEvent } from "@/lib/catalyst/catalyst-event-visuals";
import { catalystSourceBadge, isIssuerWireRelease } from "@/lib/catalyst/presentation";
import { CatalystEventCard } from "@/components/catalyst/CatalystEventCard";
import type { CatalystHistoricalSummary } from "@/lib/catalyst/catalyst-historical-facts";
import type { CatalystEvent } from "@/types/catalyst";

const NOW = Date.parse("2026-11-06T16:00:00.000Z");

const emptySummary: CatalystHistoricalSummary = {
  available: false,
  lines: [],
  linkedEventCount: 0,
  comparableEpisodeCount: 0,
  priorEvents: [],
};

function event(overrides: Partial<CatalystEvent>): CatalystEvent {
  return {
    id: overrides.id ?? "evt-1",
    dedupe_key: "dedupe-1",
    symbol: "ACAD",
    company_name: "ACADIA Pharmaceuticals Inc.",
    event_type: "company_news",
    verification_state: "provider_reported",
    event_date: "2026-11-06",
    event_time: "2026-11-06T14:00:00.000Z",
    time_of_day: null,
    title: "Headline",
    description: null,
    source_name: "The Motley Fool",
    source_url: "https://www.fool.com/investing/example",
    provider: "polygon",
    related_symbols: [],
    facts: { attribution_class: "direct", ticker_specific: true },
    published_at: "2026-11-06T14:00:00.000Z",
    attribution_class: "direct",
    ticker_specific: true,
    ...overrides,
  };
}

describe("Batch 195.1 issuer headline attribution", () => {
  it("does not treat an RXRX or Viatris earnings headline as an ACAD issuer event", () => {
    const rxrx = attributeStory({
      title: "Recursion Pharmaceuticals reports third-quarter earnings",
      tickers: [
        { symbol: "RXRX", companyName: "Recursion Pharmaceuticals Inc." },
        { symbol: "ACAD", companyName: "ACADIA Pharmaceuticals Inc." },
      ],
    });
    expect(rxrx.find((row) => row.symbol === "RXRX")).toMatchObject({
      class: "direct",
      ticker_specific: true,
    });
    const acadOnRxrx = rxrx.find((row) => row.symbol === "ACAD");
    expect(acadOnRxrx?.ticker_specific).toBe(false);
    expect(acadOnRxrx?.class).not.toBe("direct");

    const viatris = attributeStory({
      title: "Viatris reports third-quarter earnings; Acadia Pharmaceuticals also traded",
      tickers: [
        { symbol: "VTRS", companyName: "Viatris Inc." },
        { symbol: "ACAD", companyName: "ACADIA Pharmaceuticals Inc." },
      ],
    });
    expect(viatris.find((row) => row.symbol === "VTRS")).toMatchObject({
      class: "direct",
      ticker_specific: true,
    });
    const acadOnViatris = viatris.find((row) => row.symbol === "ACAD");
    expect(acadOnViatris).toBeDefined();
    expect(acadOnViatris?.ticker_specific).toBe(false);
    expect(acadOnViatris?.class).not.toBe("direct");
    expect(acadOnViatris?.reason).toBe("related_mention_not_issuer");
  });

  it("keeps a SpaceX Motley Fool headline off TSLA, GOOGM, GOOGN, and SPCX as issuer events", () => {
    const title = "The Motley Fool: Why SpaceX could still be a buy";
    const results = attributeStory({
      title,
      tickers: [
        { symbol: "TSLA", companyName: "Tesla, Inc." },
        { symbol: "GOOGM", companyName: "Alphabet Inc." },
        { symbol: "GOOGN", companyName: "Alphabet Inc." },
        { symbol: "SPCX", companyName: "SPCX Holdings" },
      ],
    });
    for (const symbol of ["TSLA", "GOOGM", "GOOGN", "SPCX"]) {
      const row = results.find((item) => item.symbol === symbol);
      expect(row, symbol).toBeDefined();
      expect(row?.class).not.toBe("direct");
      expect(row?.ticker_specific).toBe(false);
    }
    const soleTesla = attributeSymbol({
      title,
      symbol: "TSLA",
      companyName: "Tesla, Inc.",
      providerTickers: ["TSLA"],
      providerAssociatesSymbol: true,
    });
    expect(soleTesla.ticker_specific).toBe(false);
    expect(soleTesla.class).not.toBe("direct");
  });

  it("keeps an Arm earnings headline off ORCL while preserving the Oracle mention", () => {
    const results = attributeStory({
      title: "Arm Holdings reports record earnings as Oracle shares rise",
      tickers: [
        { symbol: "ARM", companyName: "Arm Holdings plc" },
        { symbol: "ORCL", companyName: "Oracle Corporation" },
      ],
    });
    expect(results.find((row) => row.symbol === "ARM")).toMatchObject({
      class: "direct",
      ticker_specific: true,
    });
    const oracle = results.find((row) => row.symbol === "ORCL");
    expect(oracle).toBeDefined();
    expect(oracle?.class).not.toBe("direct");
    expect(oracle?.ticker_specific).toBe(false);
    expect(oracle?.reason).toBe("related_mention_not_issuer");
  });

  it("downgrades a persisted direct ACAD row when the headline is another issuer's earnings", () => {
    const hydrated = hydrateCatalystEventVerification(
      event({
        title: "Recursion Pharmaceuticals reports third-quarter earnings",
        event_type: "earnings",
        related_symbols: ["RXRX"],
        facts: { attribution_class: "direct", ticker_specific: true },
      }),
    );
    expect(hydrated.related_symbols).toEqual(["RXRX"]);
    expect(hydrated.attribution_class).not.toBe("direct");
    expect(hydrated.ticker_specific).toBe(false);
    expect(isHighSignalCatalystEvent(hydrated)).toBe(false);
  });

  it("ranks the issuer earnings calendar ahead of a related earnings headline", () => {
    const issuer = event({
      id: "acad-calendar",
      title: "ACADIA Pharmaceuticals earnings",
      event_type: "earnings",
      provider: "earnings_calendar",
      source_name: "Earnings Calendar",
      related_symbols: [],
      attribution_class: "direct",
      ticker_specific: true,
    });
    const related = hydrateCatalystEventVerification(
      event({
        id: "acad-related",
        title: "Viatris reports third-quarter earnings",
        event_type: "earnings",
        related_symbols: ["VTRS"],
        facts: { attribution_class: "direct", ticker_specific: true },
      }),
    );
    expect(related.ticker_specific).toBe(false);
    expect(compareCatalystFeedEvents(issuer, related, "priority", NOW)).toBeLessThan(0);
    expect(isHighSignalCatalystEvent(issuer)).toBe(true);
    expect(isHighSignalCatalystEvent(related)).toBe(false);
  });

  it("labels Polygon GlobeNewswire as Press Release on the badge and the category", () => {
    const wire = {
      event_type: "company_news" as const,
      provider: "polygon",
      source_name: "GlobeNewswire",
      title: "Apple unveils a new product update",
      attribution_class: "direct" as const,
      ticker_specific: true,
    };
    expect(catalystDisplayLabelFromEvent(wire)).toBe("Press Release");
    expect(catalystSourceBadge("polygon", "GlobeNewswire", wire)).toBe("PRESS RELEASE");
  });

  it("labels Polygon Business Wire as Press Release on the badge and the category", () => {
    const wire = {
      event_type: "company_news" as const,
      provider: "polygon",
      source_name: "Business Wire",
      title: "Apple announces a supply agreement",
      attribution_class: "direct" as const,
      ticker_specific: true,
    };
    expect(catalystDisplayLabelFromEvent(wire)).toBe("Press Release");
    expect(catalystSourceBadge("polygon", "Business Wire", wire)).toBe("PRESS RELEASE");
    expect(catalystSourceBadge("news_pr", "Business Wire")).toBe("NEWS");
    expect(catalystSourceBadge("news_pr", "Business Wire", wire)).toBe("PRESS RELEASE");
  });

  it("keeps Polygon Motley Fool and Zacks on NEWS", () => {
    const motley = {
      event_type: "company_news" as const,
      provider: "polygon",
      source_name: "The Motley Fool",
      title: "The Motley Fool: Why SpaceX could still be a buy",
      attribution_class: "direct" as const,
      ticker_specific: true,
    };
    expect(catalystDisplayLabelFromEvent(motley)).toBe("News");
    expect(catalystSourceBadge("polygon", "The Motley Fool", motley)).toBe("NEWS");
    expect(catalystSourceBadge("news", "The Motley Fool")).toBe("NEWS");
    expect(catalystSourceBadge("news_pr", "The Motley Fool")).toBe("NEWS");

    const zacks = {
      event_type: "company_news" as const,
      provider: "polygon",
      source_name: "Zacks",
      title: "Zacks: Apple shares move after the open",
      attribution_class: "direct" as const,
      ticker_specific: true,
    };
    expect(catalystDisplayLabelFromEvent(zacks)).toBe("News");
    expect(catalystSourceBadge("polygon", "Zacks", zacks)).toBe("NEWS");
  });

  it("does not label a related-company earnings headline as that symbol's earnings or press release", () => {
    const title = "Viatris reports third-quarter earnings; Acadia Pharmaceuticals also traded";
    const hydrated = hydrateCatalystEventVerification(
      event({
        id: "acad-vtrs-wire",
        symbol: "ACAD",
        company_name: "ACADIA Pharmaceuticals Inc.",
        title,
        event_type: "earnings",
        provider: "polygon",
        source_name: "GlobeNewswire",
        related_symbols: ["VTRS"],
        facts: {
          attribution_class: "direct",
          ticker_specific: true,
          surprise_percent: 4.2,
          actual_eps: 1.2,
          estimate_eps: 1.1,
        },
      }),
    );
    expect(hydrated.ticker_specific).toBe(false);
    expect(catalystDisplayLabelFromEvent(hydrated)).toBe("Unverified association");
    expect(catalystDisplayLabelFromEvent(hydrated)).not.toBe("Earnings");
    expect(catalystDisplayLabelFromEvent(hydrated)).not.toBe("Press Release");
    expect(
      catalystSourceBadge(hydrated.provider, hydrated.source_name, {
        attribution_class: hydrated.attribution_class,
        ticker_specific: hydrated.ticker_specific,
      }),
    ).toBe("NEWS");

    const { unmount } = render(
      <MemoryRouter>
        <CatalystEventCard
          event={hydrated}
          isSaved={false}
          isReviewed={false}
          onToggleSaved={() => {}}
          onToggleReviewed={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Unverified association")).toBeInTheDocument();
    expect(screen.getByText("NEWS")).toBeInTheDocument();
    expect(screen.queryByText("Earnings")).toBeNull();
    expect(screen.queryByText("Press Release")).toBeNull();
    expect(screen.queryByText("PRESS RELEASE")).toBeNull();
    expect(screen.queryByText("BEAT")).toBeNull();
    unmount();
  });

  it("does not treat a wire as Press Release when issuer attribution is unknown", () => {
    expect(isIssuerWireRelease({ provider: "polygon", source_name: "GlobeNewswire" })).toBe(false);
    expect(
      catalystDisplayLabelFromEvent({
        event_type: "company_news",
        provider: "polygon",
        source_name: "GlobeNewswire",
        title: "Example Corp announces results",
      }),
    ).toBe("News");
    expect(catalystSourceBadge("polygon", "GlobeNewswire")).toBe("NEWS");
  });

  it("still classifies company IR without stored attribution as a press release source", () => {
    expect(
      isIssuerWireRelease({ provider: "company_ir", source_name: "The Motley Fool" }),
    ).toBe(true);
    expect(
      catalystDisplayLabelFromEvent({
        event_type: "company_news",
        provider: "company_ir",
        source_name: "GlobeNewswire",
        title: "Example IR update",
      }),
    ).toBe("Press Release");
  });

  it("hides Market Facts in the detail panel for a related or unverified issuer association", () => {
    const title = "Viatris reports third-quarter earnings; Acadia Pharmaceuticals also traded";
    const hydrated = hydrateCatalystEventVerification(
      event({
        id: "acad-detail",
        title,
        event_type: "earnings",
        provider: "polygon",
        source_name: "GlobeNewswire",
        related_symbols: ["VTRS"],
        facts: {
          attribution_class: "direct",
          ticker_specific: true,
          surprise_percent: 4.2,
          actual_eps: 1.2,
          estimate_eps: 1.1,
        },
      }),
    );
    expect(hydrated.ticker_specific).toBe(false);

    const { unmount } = render(
      <MemoryRouter>
        <CatalystDetailPanel
          event={hydrated}
          summary={emptySummary}
          historyLoading={false}
          open
          onOpenChange={() => {}}
          nowMs={NOW}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("catalyst-detail-panel")).toBeInTheDocument();
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(/Source:/)).toHaveTextContent("GlobeNewswire");
    expect(screen.queryByText("Market Facts")).toBeNull();
    expect(screen.queryByText("Estimate EPS")).toBeNull();
    expect(screen.queryByText("Actual EPS")).toBeNull();
    expect(screen.queryByText("Surprise")).toBeNull();
    unmount();
  });

  it("renders SpaceX Motley Fool rows for GOOGM, GOOGN, and SPCX without a press-release label", () => {
    const title = "The Motley Fool: Why SpaceX could still be a buy";
    for (const symbol of ["GOOGM", "GOOGN", "SPCX"] as const) {
      const company = symbol === "SPCX" ? "SPCX Holdings" : "Alphabet Inc.";
      const hydrated = hydrateCatalystEventVerification(
        event({
          id: symbol,
          symbol,
          company_name: company,
          title,
          event_type: "company_news",
          source_name: "The Motley Fool",
          related_symbols: ["GOOGM", "GOOGN", "SPCX"].filter((item) => item !== symbol),
          facts: { attribution_class: "direct", ticker_specific: true },
        }),
      );
      const { unmount } = render(
        <MemoryRouter>
          <CatalystEventRow
            event={hydrated}
            summary={emptySummary}
            historyLoading={false}
            isSaved={false}
            isReviewed={false}
            onOpen={() => {}}
            onToggleSaved={() => {}}
            onToggleReviewed={() => {}}
            nowMs={NOW}
          />
        </MemoryRouter>,
      );
      expect(screen.getByText(symbol)).toBeInTheDocument();
      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.queryByText("Press Release")).toBeNull();
      expect(screen.getByText("Unverified association")).toBeInTheDocument();
      unmount();
    }
  });
});
