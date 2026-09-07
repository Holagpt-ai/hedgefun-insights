import { describe, expect, it } from "vitest";
import { EVENT_TYPE_LABEL } from "@/lib/catalyst/parsers";
import { catalystSourceBadge } from "@/lib/catalyst/presentation";

describe("direct SEC Catalyst card contract", () => {
  it("keeps Filing-Related News distinct from NEWS vs SEC FILING badges", () => {
    expect(EVENT_TYPE_LABEL.sec_filing_news).toBe("Filing-Related News");
    expect(catalystSourceBadge("sec_edgar")).toBe("SEC FILING");
    expect(catalystSourceBadge("polygon")).toBe("NEWS");
    expect(catalystSourceBadge("sec_edgar")).not.toBe(catalystSourceBadge("polygon"));
  });
});
