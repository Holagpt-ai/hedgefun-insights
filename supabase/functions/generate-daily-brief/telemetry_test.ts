import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatBriefTelemetry,
  maxIndexAgeMs,
  outcomeFromIndexReason,
  type BriefOutcome,
} from "./telemetry.ts";

const OUTCOMES: BriefOutcome[] = [
  "generated",
  "source_stale",
  "provider_error",
  "parse_error",
  "db_error",
];

Deno.test("telemetry line has required fields and no secrets", () => {
  const line = formatBriefTelemetry({
    brief_type: "am",
    outcome: "provider_error",
    reason: "provider_error",
    index_age_ms: 120000,
    anthropic_http_status: 529,
    anthropic_error_type: "overloaded_error",
    elapsed_ms: 842,
  });
  const parsed = JSON.parse(line) as Record<string, unknown>;
  assertEquals(parsed.event, "generate_daily_brief");
  assertEquals(parsed.brief_type, "am");
  assertEquals(parsed.outcome, "provider_error");
  assertEquals(parsed.reason, "provider_error");
  assertEquals(parsed.index_age_ms, 120000);
  assertEquals(parsed.anthropic_http_status, 529);
  assertEquals(parsed.anthropic_error_type, "overloaded_error");
  assertEquals(parsed.elapsed_ms, 842);
  for (const forbidden of ["sk-ant", "Bearer", "x-api-key", "Authorization", "prompt"]) {
    assert(!line.includes(forbidden), `leaked ${forbidden}`);
  }
});

Deno.test("expected outcomes are distinct", () => {
  assertEquals(new Set(OUTCOMES).size, 5);
  assertEquals(outcomeFromIndexReason("source_stale"), "source_stale");
  assertEquals(outcomeFromIndexReason("source_missing_symbol"), "db_error");
});

Deno.test("maxIndexAgeMs uses the oldest required timestamp", () => {
  const now = Date.parse("2026-08-28T08:00:00.000Z");
  const age = maxIndexAgeMs(
    [
      { updated_at: "2026-08-28T07:58:00.000Z" },
      { updated_at: "2026-08-28T07:54:00.000Z" },
    ],
    now,
  );
  assertEquals(age, 6 * 60 * 1000);
});
