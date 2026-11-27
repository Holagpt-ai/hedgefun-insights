import { describe, expect, it } from "vitest";
import {
  catalystDisplayLabelFromEvent,
  catalystDisplayCategoryFromEvent,
} from "@/lib/catalyst/catalyst-event-visuals";
import { reconcileCatalystEventTypeForPresentation } from "@/lib/catalyst/catalyst-event-type-integrity";
describe("catalyst event type integrity", () => {
  it("does not label AWK Motley Fool merger editorial as M&A in the UI", () => {
    const input = {
      event_type: "merger_acquisition" as const,
      provider: "polygon",
      source_name: "The Motley Fool",
      title: "Why American Water Works Could Be a Takeover Target",
      attribution_class: "direct" as const,
      ticker_specific: true,
    };
    expect(reconcileCatalystEventTypeForPresentation(input)).toBe("company_news");
    expect(catalystDisplayCategoryFromEvent(input)).not.toBe("M_AND_A");
    expect(catalystDisplayLabelFromEvent(input)).not.toBe("M&A");
    expect(catalystDisplayLabelFromEvent(input)).toMatch(/news/i);
  });

  it("preserves verified wire direct issuer M&A classification", () => {
    const input = {
      event_type: "merger_acquisition" as const,
      provider: "company_ir",
      source_name: "Business Wire",
      title: "American Water Works announces definitive merger agreement",
      attribution_class: "direct" as const,
      ticker_specific: true,
    };
    expect(reconcileCatalystEventTypeForPresentation(input)).toBe("merger_acquisition");
    expect(catalystDisplayLabelFromEvent(input)).toBe("M&A");
  });
});