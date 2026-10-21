import { describe, expect, it } from "vitest";
import { isNoindexPath } from "@/config/seo";
import { verifiedCatalystHandoffFields } from "@/lib/daily-intelligence/market-evidence-handoff";
import { buildSymbolCatalystPlatformContext } from "@/lib/catalyst/catalyst-platform-context";
import type { CatalystEvent } from "@/types/catalyst";
import { publicWorkflowHref } from "@/lib/public/public-workflow-links";
import { buildStockDetailJsonLd, stockDetailCanonicalPath } from "@/lib/seo/stock-json-ld";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";

const nowMs = Date.parse("2026-09-12T18:00:00.000Z");

function verifiedEvent(): CatalystEvent {
  return {
    id: "ev-1",
    dedupe_key: "k1",
    symbol: "AAPL",
    company_name: "Apple",
    event_type: "company_news",
    verification_state: "provider_reported",
    event_date: "2026-09-12",
    event_time: null,
    time_of_day: null,
    title: "Verified headline",
    description: null,
    source_name: "PR",
    source_url: "https://example.com/pr",
    provider: "news",
    related_symbols: [],
    facts: { intel_lifecycle: "announced" },
    published_at: "2026-09-12T16:00:00.000Z",
    attribution_class: "direct",
    ticker_specific: true,
  };
}

describe("Batch 31 — public experience", () => {
  it("routes guests to login with preserved dashboard destinations", () => {
    const guestCatalyst = publicWorkflowHref("aapl", "catalyst", false);
    expect(guestCatalyst).toContain("/login?next=");
    expect(decodeURIComponent(guestCatalyst ?? "")).toContain("/dashboard/catalyst?symbol=AAPL");
    expect(publicWorkflowHref("aapl", "screeners", false)).toBe("/screener");
    expect(publicWorkflowHref("aapl", "screeners", true)).toBe("/dashboard/screeners");
  });

  it("marks legacy watchlist route as noindex", () => {
    expect(isNoindexPath("/watchlist")).toBe(true);
    expect(isNoindexPath("/stocks/AAPL")).toBe(false);
  });

  it("builds stock detail SEO artifacts with uppercase canonical slug", () => {
    expect(stockDetailCanonicalPath("aapl")).toBe("/stocks/AAPL");
    const jsonLd = buildStockDetailJsonLd({ symbol: "AAPL", name: "Apple Inc." });
    expect(jsonLd["@type"]).toBe("FinancialProduct");
    expect(String(jsonLd.url)).toContain("/stocks/AAPL");
  });

  it("only exports verified catalyst fields for handoffs", () => {
    const entry: CatalystEnrichmentEntry = {
      event: verifiedEvent(),
      kind: "recent",
      sortMs: nowMs,
    };
    const verified = buildSymbolCatalystPlatformContext({
      symbol: "AAPL",
      entry,
      availability: "verified",
      nowMs,
    });
    expect(verifiedCatalystHandoffFields(verified).catalystEventId).toBe("ev-1");
    expect(verifiedCatalystHandoffFields(null).catalystEventId).toBeNull();
  });
});
