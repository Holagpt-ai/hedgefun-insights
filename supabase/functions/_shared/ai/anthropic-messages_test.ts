import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { postAnthropicMessages } from "./anthropic-messages.ts";

Deno.test("empty text block is parse_error with emptyResponse", async () => {
  const result = await postAnthropicMessages({
    apiKey: "test",
    model: "claude-test",
    maxTokens: 32,
    user: "hi",
    timeoutMs: 5000,
    stage: "test",
    fetchImpl: () =>
      Promise.resolve(new Response(JSON.stringify({
        content: [{ type: "text", text: "   " }],
      }), { status: 200 })),
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.outcome, "parse_error");
  assertEquals(result.emptyResponse, true);
});

Deno.test("timeout maps to provider_error", async () => {
  const result = await postAnthropicMessages({
    apiKey: "test",
    model: "claude-test",
    maxTokens: 32,
    user: "hi",
    timeoutMs: 5000,
    stage: "test",
    fetchImpl: () => Promise.reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })),
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.errorType, "timeout");
});
