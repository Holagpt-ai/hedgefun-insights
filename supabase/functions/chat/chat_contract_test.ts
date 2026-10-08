import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";

async function source(name: string): Promise<string> {
  return (await Deno.readTextFile(new URL(`./${name}`, import.meta.url))).replaceAll("\r\n", "\n");
}

Deno.test("chat handler no longer issues a speculative non-streaming first pass", async () => {
  const src = await source("index.ts");
  assertFalse(src.includes("first_pass"));
  assertFalse(src.includes("firstPass"));
  assertFalse(src.includes("streamingMessages"));
  assert(src.includes("const includeTools = toolDefinitions.length > 0 && !!user"));
  assert(src.includes("stream: true"));
  assert(src.includes("runStreamingChatTurn"));
  assert(src.includes("isFreeDailyLimitReached"));
  assert(src.includes("isAnonymousSessionLimitReached"));
  assert(src.includes("modelAfterOpusCap"));
  assert(src.includes("resolveModel"));
  const urls = src.match(/https:\/\/api\.anthropic\.com\/v1\/messages/g) ?? [];
  assertEquals(urls.length, 3);
  assertFalse(src.includes("JSON.stringify(toolBlock.input)"));
  assertFalse(src.includes("JSON.stringify(call.input)"));
});

Deno.test("conversation persistence, titles, and memory extraction remain wired", async () => {
  const src = await source("index.ts");
  assert(src.includes('.from("ai_conversations")'));
  assert(src.includes('.from("ai_messages")'));
  assert(src.includes("Generate a 4-6 word title"));
  assert(src.includes('.from("chatbot_sessions")'));
  assert(src.includes("increment_session_message_count"));
  assert(src.includes("buildMemoryExtractionPrompt(lastUserMessage)"));
  assert(src.includes('entry_type: "chat_message"'));
});

Deno.test("CURRENT_CATALYST evidence handling is unchanged", async () => {
  const src = await source("index.ts");
  assert(src.includes("WHY IS IT MOVING / CURRENT CATALYST"));
  assert(src.includes("catalystAnswerMode=CURRENT_CATALYST_FIRST"));
  assert(src.includes("explicitNoVerifiedCatalyst"));
  assert(src.includes("FRESH_CATALYST_DISCOVERY.attempted=true"));
  assert(src.includes("institutionalLanguageRule"));
  assert(src.includes("enrichAnalystIntelligenceWithFreshCatalystSearch"));
  assert(src.includes("CURRENT_CATALYST_MODE"));
  assertFalse(src.includes("MRVL"));
});

Deno.test("tool routing is not a keyword heuristic", async () => {
  const indexSrc = await source("index.ts");
  const orchestrator = await source("stream-orchestrator.ts");
  assertFalse(/includes\(\s*["']price/i.test(indexSrc));
  assertFalse(/includes\(\s*["']quote/i.test(indexSrc));
  assertFalse(/includes\(\s*["']price/i.test(orchestrator));
  assertFalse(/includes\(\s*["']quote/i.test(orchestrator));
  assert(orchestrator.includes("MAX_TOOL_ROUNDS = 1"));
  assert(orchestrator.includes("MAX_MODEL_REQUESTS_PER_TURN"));
});

Deno.test("quote and journal tools stay registered for executeTool", async () => {
  const registry = await source("tools/registry.ts");
  assert(registry.includes("get_quote:"));
  assert(registry.includes("getQuoteHandler"));
  assert(registry.includes("get_journal_stats:"));
  assert(registry.includes("export async function executeTool"));
});
