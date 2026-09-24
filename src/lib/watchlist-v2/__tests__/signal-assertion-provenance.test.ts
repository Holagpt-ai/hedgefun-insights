import { describe, expect, it } from "vitest";
import {
  boundWatchlistAlertReason,
  hasUnsupportedInstitutionalOrderFlowClaim,
} from "../signal-assertion-provenance";

describe("signal-assertion-provenance", () => {
  it("flags production-like Finnhub headline claims", () => {
    const headline =
      "324 buyers against 93 sellers: the solar manufacturer institutions are accumulating";
    expect(hasUnsupportedInstitutionalOrderFlowClaim(headline)).toBe(true);
    const bounded = boundWatchlistAlertReason(headline, "company_event", {
      sourceName: "Finnhub",
    });
    expect(bounded).not.toMatch(/institutions are accumulating/i);
    expect(bounded).toContain("324 buyers vs 93 sellers");
  });
});
