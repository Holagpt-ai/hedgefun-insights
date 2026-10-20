import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  parseHistoricalContextRequestBody,
  RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS,
} from "./request-bounds.ts";

Deno.test("parseHistoricalContextRequestBody rejects non-object body", () => {
  assertEquals(parseHistoricalContextRequestBody(null), { ok: false, error: "invalid_body" });
});

Deno.test("parseHistoricalContextRequestBody rejects missing requests array", () => {
  assertEquals(parseHistoricalContextRequestBody({}), { ok: false, error: "invalid_body" });
});

Deno.test("parseHistoricalContextRequestBody rejects oversized batch", () => {
  const requests = Array.from({ length: RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS + 1 }, () => ({}));
  assertEquals(parseHistoricalContextRequestBody({ requests }), { ok: false, error: "batch_too_large" });
});

Deno.test("parseHistoricalContextRequestBody accepts bounded batch", () => {
  const requests = [{ symbol: "AAA" }];
  const parsed = parseHistoricalContextRequestBody({ requests });
  assertEquals(parsed, { ok: true, requests });
});
