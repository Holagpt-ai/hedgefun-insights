import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatAnthropicHttpErrorLog,
  parseAnthropicErrorDetail,
  parseAnthropicErrorType,
  readAnthropicErrorType,
} from "./anthropic-error.ts";

Deno.test("parses nested Anthropic error type and ignores message", () => {
  assertEquals(
    parseAnthropicErrorType({
      type: "error",
      error: { type: "rate_limit_error", message: "sk-ant-secret" },
    }),
    "rate_limit_error",
  );
  assertEquals(parseAnthropicErrorType({ type: "error" }), null);
  assertEquals(parseAnthropicErrorType("not-json"), null);
});

Deno.test("sanitized log has status, type, elapsed and no raw body", () => {
  const raw = "sk-ant-secret-overloaded-please-retry";
  const line = formatAnthropicHttpErrorLog({
    http_status: 529,
    anthropic_error_type: "overloaded_error",
    elapsed_ms: 120,
    stage: "stream",
  });
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assertEquals(parsed.event, "anthropic_http_error");
  assertEquals(parsed.http_status, 529);
  assertEquals(parsed.anthropic_error_type, "overloaded_error");
  assertEquals(parsed.elapsed_ms, 120);
  assert(!line.includes(raw));
  for (const forbidden of ["sk-ant", "Bearer", "x-api-key", "Authorization"]) {
    assert(!line.includes(forbidden), `leaked ${forbidden}`);
  }
});

Deno.test("400 invalid_request_error keeps a sanitized message and drops secrets", () => {
  const detail = parseAnthropicErrorDetail({
    type: "error",
    error: {
      type: "invalid_request_error",
      message: "rejected sk-ant-SECRET_KEY_VALUE see https://platform.claude.com/settings/billing",
    },
    request_id: "req_011example",
  });
  assertEquals(detail.type, "invalid_request_error");
  assertEquals(detail.message, "rejected see");
  assert(detail.message !== null && !detail.message.includes("sk-ant"));
  assert(detail.message !== null && !detail.message.includes("https://"));
});

Deno.test("readAnthropicErrorType extracts type then drops the body", async () => {
  const res = new Response(
    JSON.stringify({
      type: "error",
      error: { type: "api_error", message: "full provider body must not leak" },
    }),
    { status: 500 },
  );
  assertEquals(await readAnthropicErrorType(res), "api_error");
});
