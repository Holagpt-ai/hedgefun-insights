import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isSecEdgarWriteEnabled,
  parseSecSyncRequestBody,
  shouldSkipSecDiscoveryForMarketHoliday,
} from "./activation.ts";

Deno.test("missing or empty body defaults to dry_run", () => {
  assertEquals(parseSecSyncRequestBody(null), { ok: true, mode: "dry_run" });
  assertEquals(parseSecSyncRequestBody(""), { ok: true, mode: "dry_run" });
  assertEquals(parseSecSyncRequestBody("{}"), { ok: true, mode: "dry_run" });
});

Deno.test("documented modes are accepted", () => {
  assertEquals(parseSecSyncRequestBody('{"mode":"dry_run"}'), { ok: true, mode: "dry_run" });
  assertEquals(parseSecSyncRequestBody('{"mode":"write"}'), { ok: true, mode: "write" });
});

Deno.test("unknown mode and extra options fail closed", () => {
  assertEquals(parseSecSyncRequestBody('{"mode":"live"}').ok, false);
  assertEquals(parseSecSyncRequestBody('{"write":true}').ok, false);
  assertEquals(parseSecSyncRequestBody('{"mode":"write","url":"https://evil.example"}').ok, false);
  assertEquals(parseSecSyncRequestBody('{"mode":"dry_run","count":500}').ok, false);
  assertEquals(parseSecSyncRequestBody("[]").ok, false);
  assertEquals(parseSecSyncRequestBody('{"mode":true}').ok, false);
});

Deno.test("oversized payload is rejected", () => {
  const huge = `{"mode":"dry_run","pad":"${"x".repeat(400)}"}`;
  assertEquals(parseSecSyncRequestBody(huge).ok, false);
});

Deno.test("write enable requires exact true string", () => {
  assertEquals(isSecEdgarWriteEnabled("true"), true);
  assertEquals(isSecEdgarWriteEnabled("TRUE"), false);
  assertEquals(isSecEdgarWriteEnabled("false"), false);
  assertEquals(isSecEdgarWriteEnabled(undefined), false);
});

Deno.test("market holiday never disables SEC discovery", () => {
  assertEquals(shouldSkipSecDiscoveryForMarketHoliday(true), false);
  assertEquals(shouldSkipSecDiscoveryForMarketHoliday(false), false);
});
