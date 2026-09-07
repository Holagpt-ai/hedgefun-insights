import { describe, expect, it } from "vitest";
import {
  WATCHLIST_SUMMARY_LABEL,
  WORKFLOW_LABEL,
} from "@/pages/dashboard/Catalyst";

describe("Catalyst page labels", () => {
  it("uses watchlist catalyst terminology in the workflow filter", () => {
    expect(WORKFLOW_LABEL.watchlist).toBe("Watchlist Catalysts");
  });

  it("uses watchlist catalyst terminology in the summary card", () => {
    expect(WATCHLIST_SUMMARY_LABEL).toBe("Watchlist Catalysts");
  });
});
