import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatAnthropicHttpErrorLog,
  readAnthropicErrorType,
} from "../_shared/ai/anthropic-error.ts";

Deno.test("chat/index.ts does not log the raw Anthropic body on non-2xx", async () => {
  const src = (await Deno.readTextFile(new URL("./index.ts", import.meta.url)))
    .replaceAll("\r\n", "\n");
  assertFalse(src.includes('console.error("Anthropic API error:"'));
  assertFalse(src.includes('console.error("Anthropic first-pass error:"'));
  assert(src.includes("formatAnthropicHttpErrorLog"));
  assert(src.includes("readAnthropicErrorType"));
});

Deno.test("429 branch is unchanged and does not read the provider body", async () => {
  const src = (await Deno.readTextFile(new URL("./index.ts", import.meta.url)))
    .replaceAll("\r\n", "\n");
  const streamFetch = src.indexOf("const anthropicResponse = await fetch");
  assert(streamFetch >= 0, "missing streaming Anthropic fetch");
  const streamSection = src.slice(streamFetch, streamFetch + 2000);
  assert(streamSection.includes("if (anthropicResponse.status === 429)"));
  assert(streamSection.includes('error: "Rate limit exceeded, please try again later."'));
  assert(streamSection.includes("status: 429"));
  const ratePos = streamSection.indexOf("status === 429");
  const readPos = streamSection.indexOf("readAnthropicErrorType");
  assert(ratePos >= 0 && readPos > ratePos, "429 must return before reading the provider body");
});

Deno.test("provider non-2xx log helper never includes the raw body", async () => {
  const secret = "full-anthropic-error-body-sk-ant-secret";
  const res = new Response(
    JSON.stringify({ type: "error", error: { type: "overloaded_error", message: secret } }),
    { status: 529 },
  );
  const errorType = await readAnthropicErrorType(res);
  const line = formatAnthropicHttpErrorLog({
    http_status: 529,
    anthropic_error_type: errorType,
    elapsed_ms: 15,
    stage: "stream",
  });
  assertEquals(errorType, "overloaded_error");
  assertFalse(line.includes(secret));
  assertFalse(line.includes("sk-ant"));
  assert(line.includes("529"));
  assert(line.includes("overloaded_error"));
});
