import { describe, expect, it } from "vitest";
import {
  catalystFeedStatusLabel,
  readCatalystFeedStatusFromBriefSnapshot,
} from "@/lib/pre-market/am-brief-evidence-meta";

describe("am brief evidence meta", () => {
  it("reads catalyst feed status from persisted snapshot enrichment", () => {
    expect(
      readCatalystFeedStatusFromBriefSnapshot({
        intelligence_enrichment: { catalyst_feed_status: "unavailable" },
      }),
    ).toBe("unavailable");
  });

  it("labels catalyst feed states for UI", () => {
    expect(catalystFeedStatusLabel("verified")).toContain("verified");
    expect(catalystFeedStatusLabel("unavailable")).toContain("unavailable");
  });
});
