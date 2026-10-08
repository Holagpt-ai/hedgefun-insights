import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MAX_MODEL_REQUESTS_PER_TURN,
  runStreamingChatTurn,
  shouldPersistChatAnswer,
  type FetchLike,
} from "./stream-orchestrator.ts";

/**
 * Pre-change control flow for an authenticated user with tools enabled:
 * one non-streaming probe plus one streaming answer, even when no tool was used.
 */
const BASELINE_TOOL_CAPABLE_REQUESTS = 2;

const MODEL = "claude-haiku-4-5-20251001";
const SECRET_USER = "SECRET_USER_MESSAGE";
const SECRET_SYSTEM = "SECRET_SYSTEM_PROMPT";
const SECRET_TOOL = "SECRET_TOOL_PAYLOAD";
const API_KEY = "sk-ant-test-key";

function sse(data: unknown): string {
  const type = (data as { type?: string }).type ?? "message";
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function messageStart(input = 1000, cacheRead = 0, cacheCreate = 0): unknown {
  return {
    type: "message_start",
    message: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      content: [],
      model: MODEL,
      usage: {
        input_tokens: input,
        output_tokens: 1,
        cache_read_input_tokens: cacheRead,
        cache_creation_input_tokens: cacheCreate,
      },
    },
  };
}

function messageDelta(stopReason: string, outputTokens: number): unknown {
  return {
    type: "message_delta",
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  };
}

function textEvents(text: string, input = 1000, output = 180): string {
  return [
    messageStart(input, 3, 1),
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
    { type: "content_block_stop", index: 0 },
    messageDelta("end_turn", output),
    { type: "message_stop" },
  ].map(sse).join("");
}

function streamFrom(payload: string | Uint8Array[], status = 200): Response {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = typeof payload === "string"
    ? splitBytes(encoder.encode(payload), 5)
    : payload;
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), { status, headers: { "content-type": "text/event-stream" } });
}

function splitBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.slice(i, i + size));
  return chunks;
}

function clientText(deltas: string[]): string {
  return deltas.map((text) => {
    const frame = `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
    let out = "";
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const parsed = JSON.parse(line.slice(6));
      const content = parsed.choices?.[0]?.delta?.content;
      if (typeof content === "string") out += content;
    }
    return out;
  }).join("");
}

function logsOf(lines: string[]): Array<Record<string, unknown>> {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function drive(options: {
  first: string | Uint8Array[];
  continuation?: string | Response;
  toolsEnabled?: boolean;
  messages?: unknown[];
  execute?: (call: { name: string; id: string; input: Record<string, unknown> }) => Promise<{ content: string; isError?: boolean }>;
  onText?: (text: string) => Promise<void>;
  onDiscard?: () => Promise<void>;
}) {
  const calls: Array<Record<string, unknown>> = [];
  const logs: string[] = [];
  const errors: string[] = [];
  const deltas: string[] = [];
  let messageStarts = 0;
  let discards = 0;
  const fetchImpl: FetchLike = async (_url, init) => {
    calls.push(JSON.parse(String(init?.body ?? "{}")));
    const headerKey = new Headers(init?.headers).get("x-api-key");
    assertEquals(headerKey, API_KEY);
    if (options.continuation instanceof Response) return options.continuation;
    return streamFrom(options.continuation ?? textEvents("fallback"));
  };
  const outcome = await runStreamingChatTurn({
    initialResponse: streamFrom(options.first),
    initialStartedAt: Date.now(),
    apiKey: API_KEY,
    model: MODEL,
    maxTokens: 1024,
    system: SECRET_SYSTEM,
    messages: options.messages ?? [{ role: "user", content: SECRET_USER }],
    toolsEnabled: options.toolsEnabled ?? true,
    correlationId: "corr-test-1",
    fetchImpl,
    log: (line) => logs.push(line),
    logError: (line) => errors.push(line),
    onMessageStart: async () => {
      messageStarts += 1;
    },
    onText: async (text) => {
      deltas.push(text);
      if (options.onText) await options.onText(text);
    },
    onDiscardProvisional: async () => {
      discards += 1;
      if (options.onDiscard) await options.onDiscard();
    },
    executeToolCall: options.execute ?? (async () => ({ content: "unused" })),
  });
  return { outcome, calls, logs: logsOf(logs), errors, deltas, messageStarts, discards };
}

Deno.test("ordinary no-tool question makes exactly one Anthropic request", async () => {
  const executed: string[] = [];
  const { outcome, calls, deltas, logs, messageStarts } = await drive({
    first: textEvents("Apple (AAPL) is a large-cap stock. ⚠️ Not financial advice — always do your own research."),
    toolsEnabled: true,
    messages: [{ role: "user", content: "What is the price of AAPL right now?" }],
    execute: async (call) => {
      executed.push(call.name);
      return { content: "should-not-run" };
    },
  });

  assertEquals(calls.length, 0);
  assertEquals(outcome.requestCount, 1);
  assert(outcome.requestCount < BASELINE_TOOL_CAPABLE_REQUESTS);
  assertEquals(executed, []);
  assertEquals(outcome.toolUses, []);
  assertEquals(messageStarts, 1);
  assertEquals(outcome.ok, true);
  assert(clientText(deltas).includes("Apple (AAPL)"));
  assertFalse(clientText(deltas).includes("partial_json"));

  const usage = logs.find((line) => line.event === "chat_anthropic_usage");
  const summary = logs.find((line) => line.event === "chat_turn_usage");
  assertEquals(usage?.stage, "answer");
  assertEquals(usage?.model, MODEL);
  assertEquals(usage?.correlation_id, "corr-test-1");
  assertEquals(usage?.request_index, 1);
  assertEquals(usage?.input_tokens, 1000);
  assertEquals(usage?.output_tokens, 180);
  assertEquals(usage?.cache_read_input_tokens, 3);
  assertEquals(usage?.cache_creation_input_tokens, 1);
  assertEquals(usage?.tool_calls_executed, 0);
  assertEquals(usage?.ok, true);
  assertEquals(summary?.request_count, 1);
  assertEquals(summary?.input_tokens, 1000);
  assertEquals(summary?.output_tokens, 180);
  const blob = JSON.stringify(logs);
  assertFalse(blob.includes(SECRET_USER));
  assertFalse(blob.includes(SECRET_SYSTEM));
  assertFalse(blob.includes(API_KEY));
});

Deno.test("no-tool text is forwarded before the stream finishes", async () => {
  const encoder = new TextEncoder();
  const first = [
    messageStart(50, 0, 0),
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Partial" } },
  ].map(sse).join("");
  const rest = [
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " answer" } },
    { type: "content_block_stop", index: 0 },
    messageDelta("end_turn", 8),
    { type: "message_stop" },
  ].map(sse).join("");

  let releaseRest: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseRest = resolve;
  });
  let sawEarly = false;
  const body = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(first));
      await gate;
      controller.enqueue(encoder.encode(rest));
      controller.close();
    },
  });

  const outcomePromise = runStreamingChatTurn({
    initialResponse: new Response(body),
    initialStartedAt: Date.now(),
    apiKey: API_KEY,
    model: MODEL,
    maxTokens: 1024,
    system: "sys",
    messages: [{ role: "user", content: "hi" }],
    toolsEnabled: true,
    correlationId: "corr-progressive",
    fetchImpl: async () => {
      throw new Error("unexpected continuation");
    },
    log: () => {},
    onText: async (text) => {
      if (text === "Partial") {
        sawEarly = true;
        releaseRest();
      }
    },
    executeToolCall: async () => ({ content: "no" }),
  });

  const outcome = await Promise.race([
    outcomePromise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("first text delta was buffered until stream end")), 1000);
    }),
  ]);
  assert(sawEarly);
  assertEquals(outcome.assistantText, "Partial answer");
  assertEquals(outcome.requestCount, 1);
});

Deno.test("stock quote tool executes once and its result is the only continuation context", async () => {
  const toolStream = [
    messageStart(800, 2, 0),
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_quote", name: "get_quote", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"tick" } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "er\":\"AAPL\"}" } },
    { type: "content_block_stop", index: 0 },
    messageDelta("tool_use", 30),
    { type: "message_stop" },
  ].map(sse).join("");

  const seen: Array<{ name: string; id: string; input: Record<string, unknown> }> = [];
  const messages = [
    { role: "user", content: "Earlier question" },
    { role: "assistant", content: "Earlier answer" },
    { role: "user", content: "What is AAPL trading at?" },
  ];
  const { outcome, calls, deltas, logs } = await drive({
    first: toolStream,
    continuation: textEvents("Apple (AAPL) last price is $190. ⚠️ Not financial advice — always do your own research.", 900, 120),
    messages,
    execute: async (call) => {
      seen.push(call);
      return { content: `${SECRET_TOOL} AAPL last_price 190` };
    },
  });

  assertEquals(outcome.requestCount, 2);
  assertEquals(calls.length, 1);
  assertEquals(seen.length, 1);
  assertEquals(seen[0].name, "get_quote");
  assertEquals(seen[0].id, "toolu_quote");
  assertEquals(seen[0].input, { ticker: "AAPL" });
  assertEquals(calls[0].stream, true);
  assertEquals(calls[0].tools, undefined);
  assertEquals(calls[0].system, SECRET_SYSTEM);
  assertEquals(calls[0].model, MODEL);
  const sentMessages = calls[0].messages as Array<{ role: string; content: unknown }>;
  assertEquals(sentMessages.length, 5);
  assertEquals(sentMessages[2].content, "What is AAPL trading at?");
  const assistant = sentMessages[3].content as Array<{ type: string; id?: string; name?: string; input?: { ticker?: string } }>;
  assertEquals(assistant[0].type, "tool_use");
  assertEquals(assistant[0].id, "toolu_quote");
  assertEquals(assistant[0].name, "get_quote");
  assertEquals(assistant[0].input?.ticker, "AAPL");
  const toolResult = sentMessages[4].content as Array<{ type: string; tool_use_id: string; content: string; is_error?: boolean }>;
  assertEquals(toolResult[0].type, "tool_result");
  assertEquals(toolResult[0].tool_use_id, "toolu_quote");
  assert(toolResult[0].content.includes("190"));
  assertEquals(toolResult[0].is_error, undefined);
  const visible = clientText(deltas);
  assertEquals(visible.includes("{\"tick"), false);
  assertEquals(visible.includes("toolu_quote"), false);
  assert(visible.includes("last price is $190"));
  assertEquals(outcome.toolUses.map((tool) => tool.name), ["get_quote"]);

  const summary = logs.find((line) => line.event === "chat_turn_usage");
  assertEquals(summary?.request_count, 2);
  assertEquals(summary?.tool_calls_executed, 1);
  assertEquals(summary?.input_tokens, 1700);
  assertEquals(summary?.output_tokens, 150);
  assertEquals(summary?.correlation_id, "corr-test-1");
  assertFalse(JSON.stringify(logs).includes(SECRET_TOOL));
  assertFalse(JSON.stringify(logs).includes(API_KEY));
});

Deno.test("multiple tool calls keep ids, inputs, execution order, and one continuation", async () => {
  const first = [
    messageStart(400, 0, 0),
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_a", name: "get_quote", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"ticker\":\"MSFT\"}" } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_b", name: "get_recent_trades", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"limit\":3}" } },
    { type: "content_block_stop", index: 1 },
    messageDelta("tool_use", 40),
    { type: "message_stop" },
  ].map(sse).join("");
  const order: string[] = [];
  const { outcome, calls } = await drive({
    first,
    continuation: textEvents("Both tools incorporated.", 500, 20),
    execute: async (call) => {
      order.push(`${call.name}:${call.id}:${JSON.stringify(call.input)}`);
      return { content: `result-${call.name}` };
    },
  });
  assertEquals(order, [
    'get_quote:toolu_a:{"ticker":"MSFT"}',
    'get_recent_trades:toolu_b:{"limit":3}',
  ]);
  assertEquals(outcome.requestCount, 2);
  assertEquals(calls.length, 1);
  const results = (calls[0].messages as Array<{ content: unknown }>)[2].content as Array<{ tool_use_id: string; content: string }>;
  assertEquals(results.map((result) => result.tool_use_id), ["toolu_a", "toolu_b"]);
  assertEquals(results[0].content, "result-get_quote");
  assertEquals(results[1].content, "result-get_recent_trades");
  assertEquals(MAX_MODEL_REQUESTS_PER_TURN, 2);
});

Deno.test("tool failure is returned to the model and does not start a third request", async () => {
  const first = [
    messageStart(100, 0, 0),
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_bad", name: "get_quote", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"ticker\":\"ZZ\"}" } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_ok", name: "get_journal_stats", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{}" } },
    { type: "content_block_stop", index: 1 },
    messageDelta("tool_use", 15),
    { type: "message_stop" },
  ].map(sse).join("");
  const called: string[] = [];
  const { outcome, calls } = await drive({
    first,
    continuation: textEvents("The quote lookup failed. Journal stats are empty.", 120, 18),
    execute: async (call) => {
      called.push(call.name);
      if (call.name === "get_quote") throw new Error("polygon down");
      return { content: "journal-ok", isError: false };
    },
  });
  assertEquals(called, ["get_quote", "get_journal_stats"]);
  assertEquals(outcome.requestCount, 2);
  assertEquals(calls.length, 1);
  const results = (calls[0].messages as Array<{ content: unknown }>)[2].content as Array<{ tool_use_id: string; content: string; is_error?: boolean }>;
  assertEquals(results[0].tool_use_id, "toolu_bad");
  assertEquals(results[0].content, "Tool execution failed.");
  assertEquals(results[0].is_error, true);
  assertFalse(results[0].content.includes("polygon"));
  assertEquals(results[1].content, "journal-ok");
  assertEquals(results[1].is_error, undefined);
});

Deno.test("invalid tool JSON does not execute the handler and still completes in two requests", async () => {
  const first = [
    messageStart(80, 0, 0),
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_badjson", name: "get_quote", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"ticker\":" } },
    { type: "content_block_stop", index: 0 },
    messageDelta("tool_use", 10),
    { type: "message_stop" },
  ].map(sse).join("");
  let executions = 0;
  const { outcome, calls, deltas } = await drive({
    first,
    continuation: textEvents("I could not read that ticker request.", 90, 12),
    execute: async () => {
      executions += 1;
      return { content: "should-not-run" };
    },
  });
  assertEquals(executions, 0);
  assertEquals(outcome.requestCount, 2);
  const results = (calls[0].messages as Array<{ content: unknown }>)[2].content as Array<{ content: string; is_error?: boolean }>;
  assertEquals(results[0].content, "Tool input could not be read.");
  assertEquals(results[0].is_error, true);
  assertFalse(clientText(deltas).includes("{\"ticker\":"));
});

Deno.test("split and malformed chunks still produce the text answer in one request", async () => {
  const payload = "data: {not-json}\n\n" + textEvents("Long enough ✓") + "\n: keep-alive\n\n";
  const bytes = splitBytes(new TextEncoder().encode(payload), 1);
  const { outcome, calls, deltas } = await drive({
    first: bytes,
    toolsEnabled: true,
  });
  assertEquals(calls.length, 0);
  assertEquals(outcome.requestCount, 1);
  assertEquals(clientText(deltas), "Long enough ✓");
});

Deno.test("long responses emit each text delta instead of one buffered blob", async () => {
  const parts = Array.from({ length: 200 }, () => "word ");
  const events = [
    sse(messageStart(2000, 0, 0)),
    sse({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    ...parts.map((part) => sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: part } })),
    sse({ type: "content_block_stop", index: 0 }),
    sse(messageDelta("end_turn", 200)),
    sse({ type: "message_stop" }),
  ].join("");
  const { outcome, calls, deltas } = await drive({
    first: splitBytes(new TextEncoder().encode(events), 17),
  });
  assertEquals(calls.length, 0);
  assertEquals(outcome.requestCount, 1);
  assertEquals(deltas.length, 200);
  assertEquals(deltas.join(""), parts.join(""));
});

Deno.test("a continuation that still contains tool_use cannot start a third model request", async () => {
  const first = [
    messageStart(10, 0, 0),
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_once", name: "get_quote", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"ticker\":\"NVDA\"}" } },
    { type: "content_block_stop", index: 0 },
    messageDelta("tool_use", 8),
    { type: "message_stop" },
  ].map(sse).join("");
  const second = [
    messageStart(11, 0, 0),
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Final answer." } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_again", name: "get_quote", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"ticker\":\"NVDA\"}" } },
    { type: "content_block_stop", index: 1 },
    messageDelta("tool_use", 9),
    { type: "message_stop" },
  ].map(sse).join("");
  let executions = 0;
  const { outcome, calls, deltas, errors } = await drive({
    first,
    continuation: second,
    execute: async () => {
      executions += 1;
      return { content: "quote" };
    },
  });
  assertEquals(executions, 1);
  assertEquals(calls.length, 1);
  assertEquals(outcome.requestCount, 2);
  assertEquals(clientText(deltas), "Final answer.");
  assert(errors.some((line) => line.includes("chat_tool_round_capped")));
});

Deno.test("provisional text before a tool call is dropped from the kept answer", async () => {
  const first = [
    messageStart(12, 0, 0),
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Checking. " } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_pre", name: "get_quote", input: {} } },
    { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"ticker\":\"IBM\"}" } },
    { type: "content_block_stop", index: 1 },
    { type: "content_block_start", index: 2, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "Unverified $999. " } },
    { type: "content_block_stop", index: 2 },
    messageDelta("tool_use", 14),
    { type: "message_stop" },
  ].map(sse).join("");
  let shown = "";
  const { outcome, calls, deltas, discards } = await drive({
    first,
    continuation: textEvents("IBM is $10.", 20, 6),
    execute: async () => ({ content: "10" }),
    onText: async (text) => {
      shown += text;
    },
    onDiscard: async () => {
      shown = "";
    },
  });
  assertEquals(calls.length, 1);
  assertEquals(discards, 1);
  assertEquals(shown, "IBM is $10.");
  assertEquals(outcome.assistantText, "IBM is $10.");
  assertEquals(outcome.continuationFailed, false);
  assert(deltas.includes("Checking. "));
  assertFalse(deltas.includes("Unverified $999. "));
  assertFalse(shown.includes("Checking."));
  assertFalse(clientText(deltas).includes("IBM\""));
});

Deno.test("tools are not executed when the turn is not tool-enabled", async () => {
  const first = [
    messageStart(5, 0, 0),
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_skip", name: "get_quote", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"ticker\":\"AAPL\"}" } },
    { type: "content_block_stop", index: 0 },
    messageDelta("tool_use", 4),
    { type: "message_stop" },
  ].map(sse).join("");
  let executions = 0;
  const { outcome, calls, deltas } = await drive({
    first,
    toolsEnabled: false,
    execute: async () => {
      executions += 1;
      return { content: "no" };
    },
  });
  assertEquals(executions, 0);
  assertEquals(calls.length, 0);
  assertEquals(outcome.requestCount, 1);
  assertEquals(deltas, []);
});

Deno.test("continuation HTTP 429 does not read or log the provider body", async () => {
  const first = [
    messageStart(5, 0, 0),
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_rate", name: "get_quote", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"ticker\":\"AAPL\"}" } },
    { type: "content_block_stop", index: 0 },
    messageDelta("tool_use", 4),
    { type: "message_stop" },
  ].map(sse).join("");
  const secret = "sk-ant-continuation-secret";
  const continuation = new Response(
    JSON.stringify({ error: { type: "rate_limit_error", message: secret } }),
    { status: 429 },
  );
  const { outcome, errors, logs } = await drive({
    first,
    continuation,
    execute: async () => ({ content: "quote" }),
  });
  assertEquals(outcome.requestCount, 2);
  assertEquals(outcome.ok, false);
  assertEquals(outcome.continuationFailed, true);
  assertEquals(outcome.assistantText, "");
  assertEquals(shouldPersistChatAnswer(outcome.ok, outcome.assistantText), false);
  assertEquals(shouldPersistChatAnswer(true, "Apple (AAPL) is $190."), true);
  assertEquals(shouldPersistChatAnswer(false, "Partial quote"), false);
  const blob = errors.join("\n") + JSON.stringify(logs);
  assert(blob.includes("429"));
  assert(blob.includes("\"anthropic_error_type\":null"));
  assertFalse(blob.includes(secret));
  assertFalse(blob.includes("rate_limit_error"));
  const orchestrator = (await Deno.readTextFile(new URL("./stream-orchestrator.ts", import.meta.url))).replaceAll("\r\n", "\n");
  const rateBranch = orchestrator.indexOf("continuationResponse.status !== 429");
  const readCall = orchestrator.indexOf("readAnthropicErrorType(continuationResponse)");
  assert(rateBranch >= 0 && readCall > rateBranch);
  assertFalse(orchestrator.slice(rateBranch, readCall).includes("await continuationResponse.text"));
});

Deno.test("logged usage uses message_delta totals, including cache fields", async () => {
  const first = [
    sse(messageStart(10, 1, 0)),
    sse({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } }),
    sse({ type: "content_block_stop", index: 0 }),
    sse({
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: {
        input_tokens: 80,
        output_tokens: 40,
        cache_read_input_tokens: 9,
        cache_creation_input_tokens: 2,
      },
    }),
    sse({ type: "message_stop" }),
  ].join("");
  const { logs, outcome, discards } = await drive({ first, toolsEnabled: true });
  const usage = logs.find((line) => line.event === "chat_anthropic_usage");
  assertEquals(outcome.requestCount, 1);
  assertEquals(outcome.continuationFailed, false);
  assertEquals(discards, 0);
  assertEquals(usage?.input_tokens, 80);
  assertEquals(usage?.output_tokens, 40);
  assertEquals(usage?.cache_read_input_tokens, 9);
  assertEquals(usage?.cache_creation_input_tokens, 2);
  assertEquals(usage?.correlation_id, "corr-test-1");
});

Deno.test("continuation stream usage already received is logged when the client closes", async () => {
  const first = [
    messageStart(5, 0, 0),
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_usage", name: "get_quote", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"ticker\":\"AAPL\"}" } },
    { type: "content_block_stop", index: 0 },
    messageDelta("tool_use", 4),
    { type: "message_stop" },
  ].map(sse).join("");
  const continuation = [
    sse(messageStart(77, 0, 0)),
    sse({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
    sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "BOOM" } }),
  ].join("");
  const { outcome, logs } = await drive({
    first,
    continuation,
    execute: async () => ({ content: "quote" }),
    onText: async (text) => {
      if (text === "BOOM") throw new Error("client closed");
    },
  });
  const continuationLog = logs.find((line) => line.stage === "tool_continuation");
  assertEquals(outcome.requestCount, 2);
  assertEquals(outcome.continuationFailed, false);
  assertEquals(outcome.ok, false);
  assertEquals(continuationLog?.input_tokens, 77);
  assertEquals(continuationLog?.output_tokens, null);
  assertEquals(shouldPersistChatAnswer(outcome.ok, "BOOM"), false);
});

Deno.test("simulated no-tool input savings are labeled separately from measured usage", async () => {
  const measuredInput = 1000;
  const measuredOutput = 180;
  const { logs } = await drive({
    first: textEvents("Measured answer.", measuredInput, measuredOutput),
  });
  const summary = logs.find((line) => line.event === "chat_turn_usage");
  assertEquals(summary?.input_tokens, measuredInput);
  assertEquals(summary?.output_tokens, measuredOutput);
  assertEquals(summary?.request_count, 1);
  // The removed probe resent the same system prompt, history, and tools.
  // This doubles counted input only as a structural simulation. The discarded
  // probe's output tokens were not measured.
  const simulatedPreviousInput = measuredInput * BASELINE_TOOL_CAPABLE_REQUESTS;
  assertEquals(simulatedPreviousInput - measuredInput, measuredInput);
});
