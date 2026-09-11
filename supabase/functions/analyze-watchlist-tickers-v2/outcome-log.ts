// Sanitized structured outcome log for one Watchlist V2 analyzer invocation.
// Never carries API keys, auth headers, prompts, raw provider bodies, or user IDs.

import { LOG_PREFIX } from "../_shared/watchlist-v2/sanitize.ts";
import { STALE_MS, type SnapshotTimestampSource } from "../_shared/watchlist-v2/market-data.ts";
import { normalizeTicker } from "../_shared/watchlist-v2/contract.ts";
import {
  CLAUDE_DECISIONS,
  type ClaudeDecision,
} from "../_shared/watchlist-v2/cost-control.ts";

export type AnalyzerOrigin = "trigger" | "manual" | "batch";
export type AnalyzerOutcomeKind =
  | "succeeded"
  | "data_unavailable"
  | "failed"
  | "not_applicable"
  | "unresolved";

export type AnalyzerSession = "premarket" | "rth" | "postclose";

export type AnalyzerProviderStage =
  | "polygon_snapshot"
  | "polygon_bars"
  | "anthropic_ai"
  | "watchlist_ai";

export interface AnalyzerOutcomeLog {
  symbol: string;
  origin: AnalyzerOrigin;
  session: AnalyzerSession | null;
  outcome: AnalyzerOutcomeKind;
  failure_reason: string | null;
  snapshot_age_ms: number | null;
  stale_threshold_ms: number;
  snapshot_timestamp_source: SnapshotTimestampSource | null;
  bar_count: number | null;
  rvol_available: boolean | null;
  catalyst_present: boolean | null;
  earnings_present: boolean | null;
  signal_count: number | null;
  missing_evidence_count: number | null;
  provider_stage: AnalyzerProviderStage | null;
  anthropic_http_status: number | null;
  claude_decision: ClaudeDecision | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_http_status: number | null;
  ai_latency_ms: number | null;
  ai_input_tokens: number | null;
  ai_output_tokens: number | null;
  ai_retry_count: number | null;
  ai_fallback: "off" | null;
  elapsed_ms: number;
}

export const ANALYZER_OUTCOME_LOG_KEYS = [
  "symbol",
  "origin",
  "session",
  "outcome",
  "failure_reason",
  "snapshot_age_ms",
  "stale_threshold_ms",
  "snapshot_timestamp_source",
  "bar_count",
  "rvol_available",
  "catalyst_present",
  "earnings_present",
  "signal_count",
  "missing_evidence_count",
  "provider_stage",
  "anthropic_http_status",
  "claude_decision",
  "ai_provider",
  "ai_model",
  "ai_http_status",
  "ai_latency_ms",
  "ai_input_tokens",
  "ai_output_tokens",
  "ai_retry_count",
  "ai_fallback",
  "elapsed_ms",
] as const;

const ORIGINS: ReadonlySet<string> = new Set(["trigger", "manual", "batch"]);
const OUTCOMES: ReadonlySet<string> = new Set([
  "succeeded", "data_unavailable", "failed", "not_applicable", "unresolved",
]);
const SESSIONS: ReadonlySet<string> = new Set(["premarket", "rth", "postclose"]);
const SOURCES: ReadonlySet<string> = new Set(["lastTrade", "lastQuote", "updated", "min"]);
const STAGES: ReadonlySet<string> = new Set([
  "polygon_snapshot", "polygon_bars", "anthropic_ai", "watchlist_ai",
]);
const AI_PROVIDERS: ReadonlySet<string> = new Set(["qwen", "anthropic"]);
const FALLBACKS: ReadonlySet<string> = new Set(["off"]);

const FORBIDDEN_LOG_SNIPPETS = [
  "apiKey", "x-api-key", "Bearer", "sk-ant", "token=", "Authorization",
  "prompt", "ANTHROPIC_API_KEY", "POLYGON_API_KEY", "QWEN_API_KEY",
];

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function strOrNull(v: unknown, allowed: ReadonlySet<string>): string | null {
  return typeof v === "string" && allowed.has(v) ? v : null;
}

/** Batch invocations always include run_id; trigger/manual do not. */
export function resolveAnalyzerOrigin(
  source: "trigger" | "manual",
  runId: string | null,
): AnalyzerOrigin {
  return runId ? "batch" : source;
}

export function emptyAnalyzerOutcomeLog(
  symbol: string,
  origin: AnalyzerOrigin,
): AnalyzerOutcomeLog {
  return {
    symbol: normalizeTicker(symbol) ?? "",
    origin,
    session: null,
    outcome: "failed",
    failure_reason: null,
    snapshot_age_ms: null,
    stale_threshold_ms: STALE_MS,
    snapshot_timestamp_source: null,
    bar_count: null,
    rvol_available: null,
    catalyst_present: null,
    earnings_present: null,
    signal_count: null,
    missing_evidence_count: null,
    provider_stage: null,
    anthropic_http_status: null,
    claude_decision: null,
    ai_provider: null,
    ai_model: null,
    ai_http_status: null,
    ai_latency_ms: null,
    ai_input_tokens: null,
    ai_output_tokens: null,
    ai_retry_count: null,
    ai_fallback: null,
    elapsed_ms: 0,
  };
}

/** Project onto the allowlisted primitive fields. Never copies unknown keys. */
export function sanitizeAnalyzerOutcomeLog(input: AnalyzerOutcomeLog): AnalyzerOutcomeLog {
  const origin = ORIGINS.has(input.origin) ? input.origin : "trigger";
  const outcome = OUTCOMES.has(input.outcome) ? input.outcome : "failed";
  return {
    symbol: normalizeTicker(input.symbol) ?? "",
    origin,
    session: strOrNull(input.session, SESSIONS) as AnalyzerSession | null,
    outcome,
    failure_reason: typeof input.failure_reason === "string" && input.failure_reason
      ? input.failure_reason.slice(0, 64)
      : null,
    snapshot_age_ms: finiteOrNull(input.snapshot_age_ms),
    stale_threshold_ms: STALE_MS,
    snapshot_timestamp_source: strOrNull(
      input.snapshot_timestamp_source,
      SOURCES,
    ) as SnapshotTimestampSource | null,
    bar_count: finiteOrNull(input.bar_count),
    rvol_available: boolOrNull(input.rvol_available),
    catalyst_present: boolOrNull(input.catalyst_present),
    earnings_present: boolOrNull(input.earnings_present),
    signal_count: finiteOrNull(input.signal_count),
    missing_evidence_count: finiteOrNull(input.missing_evidence_count),
    provider_stage: strOrNull(input.provider_stage, STAGES) as AnalyzerProviderStage | null,
    anthropic_http_status: finiteOrNull(input.anthropic_http_status),
    claude_decision: strOrNull(
      input.claude_decision,
      CLAUDE_DECISIONS as ReadonlySet<string>,
    ) as ClaudeDecision | null,
    ai_provider: strOrNull(input.ai_provider, AI_PROVIDERS),
    ai_model: typeof input.ai_model === "string" && input.ai_model
      ? input.ai_model.slice(0, 64)
      : null,
    ai_http_status: finiteOrNull(input.ai_http_status),
    ai_latency_ms: finiteOrNull(input.ai_latency_ms),
    ai_input_tokens: finiteOrNull(input.ai_input_tokens),
    ai_output_tokens: finiteOrNull(input.ai_output_tokens),
    ai_retry_count: finiteOrNull(input.ai_retry_count),
    ai_fallback: strOrNull(input.ai_fallback, FALLBACKS) as "off" | null,
    elapsed_ms: finiteOrNull(input.elapsed_ms) ?? 0,
  };
}

export function formatAnalyzerOutcomeLog(input: AnalyzerOutcomeLog): string {
  const safe = sanitizeAnalyzerOutcomeLog(input);
  return `${LOG_PREFIX} analyzer_outcome ${JSON.stringify(safe)}`;
}

export function emitAnalyzerOutcomeLog(input: AnalyzerOutcomeLog): void {
  console.log(formatAnalyzerOutcomeLog(input));
}

export function outcomeLogContainsSecrets(line: string): boolean {
  const lower = line.toLowerCase();
  for (const snippet of FORBIDDEN_LOG_SNIPPETS) {
    if (lower.includes(snippet.toLowerCase())) return true;
  }
  if (line.includes("https://") || line.includes("http://")) return true;
  return false;
}
