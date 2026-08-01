// Provider-stage observability: the diagnostic log must identify the failing
// stage without ever carrying credentials, URLs, prompts or response bodies.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildProviderFailureDiagnostic, formatProviderFailureLog, type ProviderStage,
} from "./index.ts";
import { LOG_PREFIX } from "../_shared/watchlist-v2/sanitize.ts";
import type { ProviderTransportFailure } from "../_shared/watchlist-v2/market-data.ts";

const STAGES: ProviderStage[] = ["polygon_snapshot", "polygon_bars", "anthropic_ai"];

Deno.test("diagnostic preserves stage, persisted code, status and failure kind", () => {
  const failure: ProviderTransportFailure = {
    kind: "transport_failure", code: "PROVIDER_ERROR",
    http_status: 401, failure_kind: "http_error",
  };
  for (const stage of STAGES) {
    const d = buildProviderFailureDiagnostic("aapl", stage, failure);
    assertEquals(d, {
      ticker: "AAPL", provider_stage: stage, error_code: "PROVIDER_ERROR",
      http_status: 401, failure_kind: "http_error",
    });
  }
});

Deno.test("diagnostic maps each persisted code unchanged", () => {
  const cases: Array<[ProviderTransportFailure, string, number | null]> = [
    [{ kind: "transport_failure", code: "RATE_LIMITED", http_status: 429, failure_kind: "http_error" }, "RATE_LIMITED", 429],
    [{ kind: "transport_failure", code: "PROVIDER_TIMEOUT", http_status: null, failure_kind: "timeout" }, "PROVIDER_TIMEOUT", null],
    [{ kind: "transport_failure", code: "PROVIDER_TIMEOUT", http_status: null, failure_kind: "fetch_error" }, "PROVIDER_TIMEOUT", null],
    [{ kind: "transport_failure", code: "PROVIDER_ERROR", http_status: 200, failure_kind: "invalid_json" }, "PROVIDER_ERROR", 200],
    [{ kind: "transport_failure", code: "PROVIDER_ERROR", http_status: 500, failure_kind: "http_error" }, "PROVIDER_ERROR", 500],
  ];
  for (const [failure, code, status] of cases) {
    const d = buildProviderFailureDiagnostic("MSFT", "anthropic_ai", failure);
    assertEquals(d.error_code, code);
    assertEquals(d.http_status, status);
    assertEquals(d.failure_kind, failure.failure_kind);
  }
});

Deno.test("diagnostic exposes only the allowed fields", () => {
  const d = buildProviderFailureDiagnostic("NVVE", "polygon_bars", {
    kind: "transport_failure", code: "PROVIDER_ERROR",
    http_status: 500, failure_kind: "http_error",
  });
  assertEquals(
    Object.keys(d).sort(),
    ["error_code", "failure_kind", "http_status", "provider_stage", "ticker"],
  );
});

Deno.test("log line carries the safe prefix and no secret-bearing text", () => {
  const line = formatProviderFailureLog(buildProviderFailureDiagnostic("GRAB", "anthropic_ai", {
    kind: "transport_failure", code: "PROVIDER_ERROR",
    http_status: 401, failure_kind: "http_error",
  }));
  assert(line.startsWith(LOG_PREFIX));
  assert(line.includes("anthropic_ai"));
  assert(line.includes("401"));
  for (const forbidden of ["http://", "https://", "apiKey", "x-api-key", "Bearer", "sk-ant", "token="]) {
    assert(!line.includes(forbidden), `leaked ${forbidden}`);
  }
});
