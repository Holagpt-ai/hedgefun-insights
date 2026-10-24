import { describe, expect, it } from "vitest";
import {
  formatCatalystSourceAttribution,
  resolveRadarCatalystAssociation,
} from "@/lib/catalyst/radar-momentum-catalyst-context";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import type { CatalystEvent } from "@/types/catalyst";

const NOW = Date.parse("2026-10-23T18:00:00.000Z");

function entry(partial: Partial<CatalystEvent>, kind: "recent" | "upcoming" = "recent"): CatalystEnrichmentEntry {
  return {
    kind,
    sortMs: Date.parse(partial.published_at ?? "2026-10-23T12:00:00.000Z"),
    event: {
      id: "1",
      symbol: "AAA",
      event_type: "sec_filing_news",
      provider: "sec_edgar",
      verification_state: "provider_reported",
      event_date: "2026-10-23",
      title: "Form 8-K",
      source_name: "SEC EDGAR",
      ...partial,
    } as CatalystEvent,
  };
}

describe("radar momentum catalyst context", () => {
  it("marks breaking SEC filings as confirmed current", () => {
    expect(
      resolveRadarCatalystAssociation(
        entry({ published_at: "2026-10-23T17:30:00.000Z" }),
        NOW,
      ),
    ).toBe("confirmed_current");
  });

  it("marks older filings as historical context", () => {
    expect(
      resolveRadarCatalystAssociation(
        entry({ published_at: "2026-10-15T12:00:00.000Z" }),
        NOW,
      ),
    ).toBe("historical_context");
  });

  it("formats SEC source attribution", () => {
    expect(formatCatalystSourceAttribution({ source_name: null, provider: "sec_edgar" })).toBe("SEC EDGAR");
  });
});
