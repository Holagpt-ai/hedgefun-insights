import { describe, expect, it } from "vitest";
import {
  mapToTaxonomyV2,
  resolveCatalystAvailability,
  watchlistNewsCatalystAvailability,
} from "@/lib/catalyst/intelligence-v2";

describe("Catalyst Intelligence V2 (client)", () => {
  it("maps earnings vs guidance", () => {
    expect(mapToTaxonomyV2("earnings", "Q3 earnings beat")).toBe("EARNINGS");
    expect(mapToTaxonomyV2("earnings", "Company raises guidance")).toBe("GUIDANCE");
  });

  it("preserves verified / none / unavailable", () => {
    expect(resolveCatalystAvailability({ queryError: false, verifiedCount: 2 })).toBe("verified");
    expect(resolveCatalystAvailability({ queryError: false, verifiedCount: 0 })).toBe("none");
    expect(resolveCatalystAvailability({ queryError: true, verifiedCount: 0 })).toBe("unavailable");
  });

  it("maps watchlist news quality without collapsing unavailable into none", () => {
    expect(watchlistNewsCatalystAvailability("missing")).toBe("unavailable");
    expect(watchlistNewsCatalystAvailability("none_qualifying")).toBe("none");
    expect(watchlistNewsCatalystAvailability("ok")).toBe("verified");
  });
});
