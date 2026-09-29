import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { briefProviderFailureBody, callClaudeWithRetry } from "./claude-retry.ts";

const ARGS = {
  apiKey: "test-key",
  system: "sys",
  user: "user",
  maxTokens: 32,
  model: "claude-haiku-4-5-20251001",
  sleepMs: 0,
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

Deno.test("pre-market brief succeeds on the first provider response", async () => {
  let calls = 0;
  const result = await callClaudeWithRetry({
    ...ARGS,
    fetchImpl: () => {
      calls += 1;
      return Promise.resolve(jsonResponse(200, { content: [{ type: "text", text: "Indexes were mixed." }] }));
    },
  });
  assertEquals(calls, 1);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.text, "Indexes were mixed.");
});

Deno.test("pre-market brief retries a timeout once", async () => {
  let calls = 0;
  const result = await callClaudeWithRetry({
    ...ARGS,
    fetchImpl: () => {
      calls += 1;
      if (calls === 1) {
        const err = new Error("timed out");
        err.name = "TimeoutError";
        return Promise.reject(err);
      }
      return Promise.resolve(jsonResponse(200, { content: [{ type: "text", text: "Indexes were mixed." }] }));
    },
  });
  assertEquals(calls, 2);
  assertEquals(result.ok, true);
});

Deno.test("pre-market brief does not retry a malformed response", async () => {
  let calls = 0;
  const result = await callClaudeWithRetry({
    ...ARGS,
    fetchImpl: () => {
      calls += 1;
      return Promise.resolve(jsonResponse(200, { content: [{ type: "text", text: "   " }] }));
    },
  });
  assertEquals(calls, 1);
  assertEquals(result.ok, false);
  if (!result.ok) {
    const body = briefProviderFailureBody(result);
    assertEquals(body.body.reason, "malformed_response");
    assertEquals(body.body.failure_category, "MALFORMED_RESPONSE");
    assertEquals(body.body.retryable, false);
    assertEquals(JSON.stringify(body).includes("test-key"), false);
  }
});

Deno.test("pre-market provider 500 is retryable and does not leak the provider body", async () => {
  let calls = 0;
  const result = await callClaudeWithRetry({
    ...ARGS,
    fetchImpl: () => {
      calls += 1;
      return Promise.resolve(jsonResponse(500, { error: { type: "api_error", message: "sk-ant-secret" } }));
    },
  });
  assertEquals(calls, 2);
  assertEquals(result.ok, false);
  if (!result.ok) {
    const body = briefProviderFailureBody(result);
    assertEquals(body.body.failure_category, "PROVIDER_5XX");
    assertEquals(body.body.reason, "temporarily_unavailable");
    assertEquals(body.body.retryable, true);
    assertEquals(JSON.stringify(body).includes("sk-ant"), false);
  }
});

Deno.test("pre-market auth failure is not retried", async () => {
  let calls = 0;
  const result = await callClaudeWithRetry({
    ...ARGS,
    fetchImpl: () => {
      calls += 1;
      return Promise.resolve(jsonResponse(401, { error: { type: "authentication_error", message: "bad" } }));
    },
  });
  assertEquals(calls, 1);
  if (!result.ok) assertEquals(briefProviderFailureBody(result).body.failure_category, "AUTH");
});
