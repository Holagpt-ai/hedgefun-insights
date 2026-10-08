import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getCapabilities } from "./capabilities.ts";
import {
  ANONYMOUS_SESSION_MESSAGE_LIMIT,
  FREE_DAILY_MESSAGE_LIMIT,
  isAnonymousSessionLimitReached,
  isFreeDailyLimitReached,
  maxTokensFor,
  MODEL_HAIKU,
  MODEL_OPUS,
  MODEL_SONNET,
  modelAfterOpusCap,
  PRO_OPUS_DAILY_CAP,
  resolveModel,
  tierFromRequest,
} from "./chat-policy.ts";

Deno.test("anonymous and free users stay on Haiku for every tier", () => {
  for (const plan of ["free", "anonymous", ""]) {
    assertEquals(resolveModel("fast", plan), MODEL_HAIKU);
    assertEquals(resolveModel("standard", plan), MODEL_HAIKU);
    assertEquals(resolveModel("deep", plan), MODEL_HAIKU);
  }
  assertEquals(tierFromRequest("nope"), "fast");
  assertEquals(tierFromRequest(undefined), "fast");
});

Deno.test("Pro Fast, Standard, and Deep keep their model assignments", () => {
  assertEquals(resolveModel("fast", "pro"), MODEL_HAIKU);
  assertEquals(resolveModel("standard", "pro"), MODEL_SONNET);
  assertEquals(resolveModel("deep", "pro"), MODEL_OPUS);
  assertEquals(resolveModel("fast", "admin"), MODEL_HAIKU);
  assertEquals(resolveModel("standard", "unlimited"), MODEL_SONNET);
  assertEquals(resolveModel("deep", "admin"), MODEL_OPUS);
  assertEquals(resolveModel("deep", "unlimited"), MODEL_OPUS);
});

Deno.test("Pro Opus cap falls back to Sonnet at 20 and admin/unlimited stay on Opus", () => {
  assertEquals(PRO_OPUS_DAILY_CAP, 20);
  assertEquals(modelAfterOpusCap("pro", MODEL_OPUS, 19), MODEL_OPUS);
  assertEquals(modelAfterOpusCap("pro", MODEL_OPUS, 20), MODEL_SONNET);
  assertEquals(modelAfterOpusCap("pro", MODEL_OPUS, 21), MODEL_SONNET);
  assertEquals(modelAfterOpusCap("pro", MODEL_SONNET, 20), MODEL_SONNET);
  assertEquals(modelAfterOpusCap("admin", MODEL_OPUS, 100), MODEL_OPUS);
  assertEquals(modelAfterOpusCap("unlimited", MODEL_OPUS, 100), MODEL_OPUS);
  assertEquals(modelAfterOpusCap("free", MODEL_OPUS, 100), MODEL_OPUS);
});

Deno.test("authenticated free and anonymous limits are unchanged", () => {
  assertEquals(FREE_DAILY_MESSAGE_LIMIT, 5);
  assertEquals(ANONYMOUS_SESSION_MESSAGE_LIMIT, 3);
  assertFalse(isFreeDailyLimitReached(4));
  assert(isFreeDailyLimitReached(5));
  assertFalse(isAnonymousSessionLimitReached(2));
  assert(isAnonymousSessionLimitReached(3));
});

Deno.test("max tokens stay tied to the resolved model", () => {
  assertEquals(maxTokensFor(MODEL_OPUS), 4096);
  assertEquals(maxTokensFor(MODEL_SONNET), 2048);
  assertEquals(maxTokensFor(MODEL_HAIKU), 1024);
});

Deno.test("authenticated free users keep quote and journal tools and do not gain web search", () => {
  const free = getCapabilities("free");
  assert(free.tools.includes("get_quote"));
  assert(free.tools.includes("get_journal_stats"));
  assert(free.tools.includes("get_recent_trades"));
  assert(free.tools.includes("get_trade"));
  assertFalse(free.tools.includes("web_search"));
  assertEquals(free.memory, false);

  const pro = getCapabilities("pro");
  assert(pro.tools.includes("get_quote"));
  assertFalse(pro.tools.includes("web_search"));
  assertEquals(pro.memory, true);

  const admin = getCapabilities("admin");
  assert(admin.tools.includes("web_search"));
  assert(admin.tools.includes("get_quote"));
  assertEquals(getCapabilities("unlimited").tools.includes("web_search"), true);
});
