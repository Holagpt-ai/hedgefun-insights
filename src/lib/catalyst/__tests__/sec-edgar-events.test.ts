import { describe, expect, it } from "vitest";
import {
  buildSecRelevanceSignals,
  catalystSymbolWorkflowHref,
  classifySecFilingTaxonomy,
  isEligibleSecEdgarForScannerSurfacing,
  resolveSecFilingTimestamps,
} from "@/lib/catalyst/sec-edgar-events";
import { classifyEnrichmentEvent, selectEnrichmentEntries } from "@/lib/catalyst/enrichment";
import { catalystDisplayCategoryFromEvent } from "@/lib/catalyst/catalyst-event-visuals";
import type { CatalystEvent } from "@/types/catalyst";

const NOW = Date.parse("2026-10-23T18:00:00.000Z");

function secEvent(overrides: Partial<CatalystEvent> = {}): CatalystEvent {
  return {
    id: "1",
    dedupe_key: "sec:0000123456-26-000001:AAA",
    symbol: "AAA",
    company_name: null,
    event_type: "sec_filing_news",
    verification_state: "provider_reported",
    event_date: "2026-10-22",
    event_time: "2026-10-23T16:00:00.000Z",
    time_of_day: null,
    title: "AAA filed Form 8-K",
    description: "Form 8-K — Items 2.02",
    source_name: "SEC EDGAR",
    source_url: "https://www.sec.gov/example",
    provider: "sec_edgar",
    related_symbols: [],
    facts: {
      form_type: "8-K",
      filing_date: "2026-10-22",
      accepted_at: "2026-10-23T16:00:00.000Z",
      sec_items: ["2.02"],
      attribution_level: "security",
    },
    published_at: "2026-10-23T16:00:00.000Z",
    ...overrides,
  };
}

describe("SEC EDGAR catalyst integration", () => {
  it("excludes attribution_invalidated rows from enrichment", () => {
    const stale = secEvent({ verification_state: "attribution_invalidated" as CatalystEvent["verification_state"] });
    expect(classifyEnrichmentEvent(stale, NOW)).toBeNull();
    expect(selectEnrichmentEntries([stale], ["AAA"], NOW).has("AAA")).toBe(false);
  });

  it("excludes stale SEC filings from screener enrichment", () => {
    const old = secEvent({
      published_at: "2026-05-01T12:00:00.000Z",
      event_date: "2026-05-01",
    });
    expect(isEligibleSecEdgarForScannerSurfacing(old, NOW)).toBe(false);
    expect(classifyEnrichmentEvent(old, NOW)).toBeNull();
  });

  it("classifies 8-K item 2.02 as earnings taxonomy without sentiment", () => {
    expect(classifySecFilingTaxonomy("t", "d", secEvent().facts)).toBe("EARNINGS");
    expect(classifySecFilingTaxonomy("t", null, { form_type: "8-K" })).toBe("SEC_FILING");
  });

  it("maps offering forms to OFFERING display category", () => {
    expect(
      catalystDisplayCategoryFromEvent({
        event_type: "sec_filing_news",
        provider: "sec_edgar",
        title: "AAA",
        facts: { form_type: "S-3" },
      }),
    ).toBe("OFFERING");
  });

  it("distinguishes filing date from SEC acceptance", () => {
    const ts = resolveSecFilingTimestamps(secEvent());
    expect(ts.filing_date).toBe("2026-10-22");
    expect(ts.accepted_at).toBe("2026-10-23T16:00:00.000Z");
  });

  it("does not fabricate market reaction signals", () => {
    const reaction = buildSecRelevanceSignals(
      {
        symbol: "AAA",
        title: "x",
        event_type: "sec_filing_news",
        event_date: "2026-10-23",
        published_at: secEvent().published_at,
        provider: "sec_edgar",
        facts: secEvent().facts,
      },
      NOW,
    ).find((s) => s.id === "market_reaction");
    expect(reaction?.available).toBe(false);
  });

  it("exposes symbol-aware workflow hrefs", () => {
    expect(catalystSymbolWorkflowHref("aaa", "catalyst")).toBe("/dashboard/catalyst?symbol=AAA");
    expect(catalystSymbolWorkflowHref("aaa", "ai")).toContain("/dashboard/ai?symbol=AAA");
  });

  it("dedupes by dedupe_key when selecting enrichment", () => {
    const a = secEvent({ id: "a" });
    const b = secEvent({ id: "b", title: "AAA filed Form 8-K duplicate" });
    const map = selectEnrichmentEntries([a, b], ["AAA"], NOW);
    expect(map.size).toBe(1);
  });
});
