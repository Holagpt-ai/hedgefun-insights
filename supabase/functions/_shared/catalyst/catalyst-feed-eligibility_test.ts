import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CATALYST_FEED_VERIFICATION_STATE,
  isEligibleCatalystFeedRow,
  isSecEdgarCatalystRow,
} from "./catalyst-feed-eligibility.ts";

Deno.test("isEligibleCatalystFeedRow accepts provider_reported only", () => {
  assertEquals(isEligibleCatalystFeedRow(CATALYST_FEED_VERIFICATION_STATE), true);
  assertEquals(isEligibleCatalystFeedRow("attribution_invalidated"), false);
  assertEquals(isEligibleCatalystFeedRow("inferred"), false);
  assertEquals(isEligibleCatalystFeedRow(null), false);
});

Deno.test("isSecEdgarCatalystRow identifies sec_edgar provider", () => {
  assertEquals(isSecEdgarCatalystRow("sec_edgar"), true);
  assertEquals(isSecEdgarCatalystRow("polygon"), false);
});
