import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatStagedPublishRpcTransportFailure,
  slugifyPublishFailureMessage,
} from "./sync-publish-rpc-error.ts";

Deno.test("slugifyPublishFailureMessage maps replace validation text", () => {
  assertEquals(
    slugifyPublishFailureMessage("nonpositive volume"),
    "nonpositive_volume",
  );
  assertEquals(
    slugifyPublishFailureMessage(
      "ratio tabs require positive prior_session_volume",
    ),
    "ratio_tabs_require_positive_prior_session_volume",
  );
  assertEquals(slugifyPublishFailureMessage(""), null);
  assertEquals(slugifyPublishFailureMessage("'; drop table--"), null);
});

Deno.test("formatStagedPublishRpcTransportFailure prefers details slug", () => {
  assertEquals(
    formatStagedPublishRpcTransportFailure({
      code: "P0001",
      message: "publish_screener_sync_staged_generation_v1",
      details: "nonpositive volume",
    }),
    "nonpositive_volume",
  );
  assertEquals(
    formatStagedPublishRpcTransportFailure({ code: "57014", message: "!!!" }),
    "57014",
  );
  assertEquals(formatStagedPublishRpcTransportFailure(null), "staged_publish_failed");
});
