import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { callClaude } from "./claude.ts";

const ARGS = {
  apiKey: "test-key",
  system: "sys",
  user: "user",
  maxTokens: 64,
  model: "claude-test",
};

Deno.test("provider non-2xx is provider_error with status and type, no body leak", async () => {
  const rawBody = JSON.stringify({
    type: "error",
    error: { type: "overloaded_error", message: "sk-ant-secret-body" },
  });
  const result = await callClaude({
    ...ARGS,
    fetchImpl: () =>
      Promise.resolve(new Response(rawBody, { status: 529 })),
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.outcome, "provider_error");
  assertEquals(result.httpStatus, 529);
  assertEquals(result.errorType, "overloaded_error");
  assertEquals(JSON.stringify(result).includes("sk-ant-secret-body"), false);
  assertEquals(JSON.stringify(result).includes("test-key"), false);
});

Deno.test("provider 2xx with empty text is parse_error", async () => {
  const result = await callClaude({
    ...ARGS,
    fetchImpl: () =>
      Promise.resolve(
        new Response(JSON.stringify({ content: [{ type: "text", text: "  " }] }), { status: 200 }),
      ),
  });
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.outcome, "parse_error");
  assertEquals(result.httpStatus, 200);
});

Deno.test("provider 2xx with text succeeds", async () => {
  const result = await callClaude({
    ...ARGS,
    fetchImpl: () =>
      Promise.resolve(
        new Response(
          JSON.stringify({ content: [{ type: "text", text: "Markets mixed pre-open." }] }),
          { status: 200 },
        ),
      ),
  });
  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.text, "Markets mixed pre-open.");
  assertEquals(result.httpStatus, 200);
});
