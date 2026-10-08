import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AnthropicMessageAssembler, AnthropicSseDecoder } from "./anthropic-sse.ts";

function sse(data: unknown): string {
  const type = (data as { type?: string }).type ?? "message";
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

Deno.test("SSE decoder reassembles lines split across reads and keeps multiple events in one read", () => {
  const payload = sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } })
    + sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " there" } });
  const decoder = new AnthropicSseDecoder();
  const firstCut = 11;
  const mid = Math.floor(payload.length / 2);
  const events = [
    ...decoder.push(payload.slice(0, firstCut)),
    ...decoder.push(payload.slice(firstCut, mid)),
    ...decoder.push(payload.slice(mid)),
    ...decoder.finish(),
  ];
  assertEquals(events.length, 2);
  assertEquals((events[0].delta as { text: string }).text, "Hello");
  assertEquals((events[1].delta as { text: string }).text, " there");
});

Deno.test("malformed SSE data lines are dropped and do not surface as text", async () => {
  const decoder = new AnthropicSseDecoder();
  const junk = decoder.push("data: {not-json}\n\n");
  assertEquals(junk.length, 0);
  const events = decoder.push(
    sse({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })
      + sse({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Safe" } }),
  );
  const assembler = new AnthropicMessageAssembler();
  const seen: string[] = [];
  for (const event of events) {
    await assembler.consume(event, (text) => {
      seen.push(text);
    });
  }
  assertEquals(seen, ["Safe"]);
  assertFalseIncludes(assembler.visibleText, "{not-json}");
});

Deno.test("tool input JSON split across deltas is accumulated and never forwarded", async () => {
  const assembler = new AnthropicMessageAssembler();
  const seen: string[] = [];
  const events = [
    { type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1, cache_read_input_tokens: 4, cache_creation_input_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "get_quote", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{\"tick" } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "er\":\"AAPL\"}" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 22 } },
    { type: "message_stop" },
  ];
  for (const event of events) {
    await assembler.consume(event, (text) => {
      seen.push(text);
    });
  }
  assertEquals(seen, []);
  assertEquals(assembler.visibleText, "");
  assertEquals(assembler.toolUses.length, 1);
  assertEquals(assembler.toolUses[0].id, "toolu_1");
  assertEquals(assembler.toolUses[0].name, "get_quote");
  assertEquals(assembler.toolUses[0].input, { ticker: "AAPL" });
  assertEquals(assembler.toolUses[0].inputValid, true);
  assertEquals(assembler.stopReason, "tool_use");
  assertEquals(assembler.usage.input_tokens, 10);
  assertEquals(assembler.usage.output_tokens, 22);
  assertEquals(assembler.usage.cache_read_input_tokens, 4);
  assertEquals(assembler.usage.cache_creation_input_tokens, 1);
});

Deno.test("unclosed tool JSON is not executable and a trailing partial event is ignored", async () => {
  const decoder = new AnthropicSseDecoder();
  const complete = sse({
    type: "content_block_start",
    index: 0,
    content_block: { type: "tool_use", id: "toolu_open", name: "get_quote", input: {} },
  });
  const partial = `data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"ticker\\":`;
  const events = [...decoder.push(complete), ...decoder.push(partial), ...decoder.finish()];
  const assembler = new AnthropicMessageAssembler();
  for (const event of events) await assembler.consume(event);
  assertEquals(assembler.toolUses.length, 0);
  assertEquals(assembler.visibleText, "");
});

Deno.test("message_delta usage is final and the message_start output placeholder is ignored", async () => {
  const assembler = new AnthropicMessageAssembler();
  const events = [
    {
      type: "message_start",
      message: {
        usage: {
          input_tokens: 10,
          output_tokens: 1,
          cache_read_input_tokens: 1,
          cache_creation_input_tokens: 0,
        },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: {
        input_tokens: 80,
        output_tokens: 40,
        cache_read_input_tokens: 9,
        cache_creation_input_tokens: 2,
      },
    },
  ];
  for (const event of events) await assembler.consume(event);
  assertEquals(assembler.usage.input_tokens, 80);
  assertEquals(assembler.usage.output_tokens, 40);
  assertEquals(assembler.usage.cache_read_input_tokens, 9);
  assertEquals(assembler.usage.cache_creation_input_tokens, 2);
  assertEquals(assembler.usage.output_tokens === 1, false);
});

function assertFalseIncludes(value: string, needle: string) {
  assert(!value.includes(needle), `unexpected ${needle}`);
}
