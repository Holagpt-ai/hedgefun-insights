import { describe, expect, it } from "vitest";
import {
  SCREENER_FEED_STATE_SELECT_BASE,
  SCREENER_FEED_STATE_SELECT_WITH_EVIDENCE,
} from "@/lib/screeners/screener-feed-fetch";

describe("screener feed fetch rollout selects", () => {
  it("keeps base select free of tab_evaluation_evidence for pre-migration fallback", () => {
    expect(SCREENER_FEED_STATE_SELECT_BASE.includes("tab_evaluation_evidence")).toBe(false);
  });

  it("extends base select with tab_evaluation_evidence only in the with-evidence variant", () => {
    expect(SCREENER_FEED_STATE_SELECT_WITH_EVIDENCE.includes("tab_evaluation_evidence")).toBe(
      true,
    );
    expect(SCREENER_FEED_STATE_SELECT_WITH_EVIDENCE.startsWith(SCREENER_FEED_STATE_SELECT_BASE.replace(",updated_at", ""))).toBe(
      true,
    );
  });
});
