import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitize, LOG_PREFIX } from "./sanitize.ts";

Deno.test("sanitize masks api keys and tokens", () => {
  const s = sanitize("https://api.polygon.io/foo?apiKey=SECRET&x=1");
  assert(!s.includes("SECRET"));
  assert(s.includes("***"));
});

Deno.test("sanitize masks bearer tokens", () => {
  const s = sanitize("Authorization: Bearer eyJabc.def.ghi");
  assert(!s.includes("eyJabc.def.ghi"));
});

Deno.test("sanitize masks uuids", () => {
  const s = sanitize("user 11111111-2222-3333-4444-555555555555 did x");
  assert(!s.includes("11111111"));
});

Deno.test("sanitize truncates length", () => {
  const s = sanitize("x".repeat(500));
  assert(s.length <= 200);
});

Deno.test("log prefix is stable", () => {
  assertEquals(LOG_PREFIX, "[wl-v2]");
});

Deno.test("sanitize masks Model Studio / DashScope URLs", () => {
  const s = sanitize("POST https://dashscope-us.aliyuncs.com/compatible-mode/v1/chat/completions key=secret");
  assert(!s.includes("dashscope-us"));
  assert(!s.includes("compatible-mode"));
});
