import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMemoryExtractionPrompt } from "./memory-extraction.ts";

const ASSISTANT_VOLUME_CLAIM = "Your 50M+ volume minimum rules out several names.";
const ASSISTANT_PRICE_RECOMMENDATION = "You should avoid stocks below $2.";

Deno.test("A. assistant-only invented threshold is not extraction evidence", () => {
  const user = "Analyze these gappers for me.";
  const prompt = buildMemoryExtractionPrompt(user);

  assert(prompt.includes(user));
  assertFalse(prompt.includes("50M+"));
  assertFalse(prompt.includes(ASSISTANT_VOLUME_CLAIM));
  assertFalse(prompt.includes("Assistant response:"));
});

Deno.test("B. assistant recommendation is not extraction evidence", () => {
  const user = "What should I watch today?";
  const prompt = buildMemoryExtractionPrompt(user);

  assert(prompt.includes(user));
  assertFalse(prompt.includes("$2"));
  assertFalse(prompt.includes(ASSISTANT_PRICE_RECOMMENDATION));
});

Deno.test("C. explicit user preference remains in extraction evidence", () => {
  const user = "I avoid stocks under $2.";
  const prompt = buildMemoryExtractionPrompt(user);

  assert(prompt.includes(user));
  assert(prompt.includes("$2"));
  assert(prompt.includes("-----USER_MESSAGE_START-----"));
  assert(prompt.includes("-----USER_MESSAGE_END-----"));
});

Deno.test("D. prompt forbids inferring assistant-generated preferences or invented thresholds", () => {
  const prompt = buildMemoryExtractionPrompt("Analyze these gappers for me.");

  assert(prompt.includes("explicitly stated by the user"));
  assert(prompt.includes("Never infer a user preference merely because the assistant mentioned"));
  assert(prompt.includes("Never convert market data, Screener criteria, AI recommendations, or assistant commentary"));
  assert(prompt.includes("Do not invent numeric thresholds"));
  assert(prompt.includes("minimum volume"));
  assert(prompt.includes("When uncertain, return {}"));
  assert(prompt.includes("tickers_of_interest"));
  assert(prompt.includes("trading_style"));
  assert(prompt.includes("risk_tolerance"));
  assert(prompt.includes("goals"));
});

Deno.test("helper signature accepts only the user message", () => {
  assertEquals(buildMemoryExtractionPrompt.length, 1);
});

Deno.test("E. chat index uses user-only extraction and keeps merge/log paths", async () => {
  const src = (await Deno.readTextFile(new URL("./index.ts", import.meta.url)))
    .replaceAll("\r\n", "\n");

  assert(src.includes('from "./memory-extraction.ts"'));
  assert(src.includes("buildMemoryExtractionPrompt(lastUserMessage)"));
  assertFalse(src.includes("buildMemoryExtractionPrompt(lastUserMessage,"));
  assertFalse(src.includes("Assistant response: ${fullContent}"));

  const extractStart = src.indexOf("Extract memory via Claude Haiku");
  assert(extractStart >= 0, "missing memory extraction block");
  const extractSection = src.slice(extractStart, extractStart + 3500);
  assertFalse(extractSection.includes("assistant_response"));
  assertFalse(extractSection.includes("fullContent"));
  assert(extractSection.includes("tickers_of_interest"));
  assert(extractSection.includes("trading_style"));
  assert(extractSection.includes("risk_tolerance"));
  assert(extractSection.includes("mergedGoals"));

  assert(src.includes('from("ai_daily_logs")'));
  assert(src.includes("assistant_response: fullContent"));
  assert(src.includes('from("ai_user_memory")'));
  assert(src.includes("Content-Type\": \"text/event-stream\""));
  assert(src.includes("executeTool"));
});
