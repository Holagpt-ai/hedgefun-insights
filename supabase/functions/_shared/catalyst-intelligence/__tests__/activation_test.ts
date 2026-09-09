import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  DEFAULT_LIMIT,
  HARD_MAX_LIMIT,
  isIntelligenceWriteEnabled,
  parseProcessorRequestBody,
} from "../activation.ts";

Deno.test("empty processor body defaults to dry_run with default limit", () => {
  const parsed = parseProcessorRequestBody("");
  assertEquals(parsed.ok, true);
  if (!parsed.ok) return;
  assertEquals(parsed.request.mode, "dry_run");
  assertEquals(parsed.request.selection.limit, DEFAULT_LIMIT);
});

Deno.test("write mode is explicit and unknown keys fail closed", () => {
  const write = parseProcessorRequestBody('{"mode":"write"}');
  assertEquals(write.ok, true);
  if (write.ok) assertEquals(write.request.mode, "write");
  assertEquals(parseProcessorRequestBody('{"mode":"live"}').ok, false);
  assertEquals(parseProcessorRequestBody('{"mode":"write","cron":true}').ok, false);
  assertEquals(parseProcessorRequestBody('{"mode":true}').ok, false);
});

Deno.test("limit is bounded by hard maximum", () => {
  const parsed = parseProcessorRequestBody('{"limit":9999}');
  assertEquals(parsed.ok, true);
  if (!parsed.ok) return;
  assertEquals(parsed.request.selection.limit, HARD_MAX_LIMIT);
  assertEquals(parseProcessorRequestBody('{"limit":0}').ok, false);
  assertEquals(parseProcessorRequestBody('{"limit":1.5}').ok, false);
});

Deno.test("write enable requires exact true string", () => {
  assertEquals(isIntelligenceWriteEnabled("true"), true);
  assertEquals(isIntelligenceWriteEnabled("TRUE"), false);
  assertEquals(isIntelligenceWriteEnabled("1"), false);
  assertEquals(isIntelligenceWriteEnabled("yes"), false);
  assertEquals(isIntelligenceWriteEnabled(undefined), false);
});
