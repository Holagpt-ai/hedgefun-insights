// Watchlist V2 intelligence provider abstraction.
// Analyzer code calls generateWatchlistAnalysis only.
// Active provider: Anthropic Haiku. Automatic cross-provider fallback is OFF.
// A dormant future-vendor sketch exists separately and is not constructed here.

import type { EvidenceCatalog } from "./ai-read.ts";
import { makeAnthropicCaller, validateAiOutput, type AiReadResult } from "./ai-read.ts";
import type { ProviderTransportFailure } from "./market-data.ts";
import { LOG_PREFIX } from "./sanitize.ts";

export type WatchlistAiProviderId = "anthropic" | "qwen";

export const DEFAULT_WATCHLIST_AI_PROVIDER: WatchlistAiProviderId = "anthropic";
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
export const WATCHLIST_AI_MAX_REPAIR_RETRIES = 1;
/** Automatic cross-provider fallback is OFF. Config cannot enable it in V1. */
export const WATCHLIST_AI_FALLBACK_ENABLED = false;

export type WatchlistAiQualityIssue =
  | "malformed_output"
  | "missing_fields"
  | "invalid_direction"
  | "parsing_failure"
  | "unusually_short_response"
  | "unusually_long_response"
  | "provider_timeout"
  | "rate_limited"
  | "provider_error"
  | "unknown_driver_id"
  | "extra_key"
  | "forbidden_key"
  | "bad_driver_ids"
  | "config_error";

export interface WatchlistAiConfig {
  provider: WatchlistAiProviderId;
  model: string;
  anthropicApiKey: string;
  fallbackEnabled: false;
  fallbackRequested: boolean;
  maxRepairRetries: number;
}

export interface WatchlistAiRequest {
  prompt: string;
  catalog: EvidenceCatalog;
}

export interface WatchlistAiUsage {
  input_tokens: number | null;
  output_tokens: number | null;
}

export interface WatchlistAiCallMeta {
  provider: WatchlistAiProviderId;
  model: string;
  latency_ms: number;
  retry_count: number;
  usage: WatchlistAiUsage;
  http_status: number | null;
  quality_issue: WatchlistAiQualityIssue | null;
  fallback: "off";
}

export type WatchlistAiCallResult =
  | { kind: "ok"; value: AiReadResult; meta: WatchlistAiCallMeta }
  | (ProviderTransportFailure & { meta: WatchlistAiCallMeta })
  | { kind: "validation_failed"; reason: string; meta: WatchlistAiCallMeta }
  | { kind: "config_error"; reason: string; meta: WatchlistAiCallMeta };

export interface WatchlistAiRawComplete {
  kind: "ok" | "transport_failure";
  rawText?: string;
  usage?: WatchlistAiUsage;
  http_status?: number | null;
  code?: ProviderTransportFailure["code"];
  failure_kind?: ProviderTransportFailure["failure_kind"];
}

export interface WatchlistAiAdapter {
  readonly id: WatchlistAiProviderId;
  readonly model: string;
  complete(prompt: string): Promise<WatchlistAiRawComplete>;
}

export function resolveWatchlistAiConfig(
  env: Record<string, string | undefined>,
): WatchlistAiConfig {
  const rawProvider = (env.WATCHLIST_AI_PROVIDER ?? DEFAULT_WATCHLIST_AI_PROVIDER)
    .trim()
    .toLowerCase();
  const provider: WatchlistAiProviderId = rawProvider === "qwen" ? "qwen" : "anthropic";
  const fallbackRequested = (env.WATCHLIST_AI_FALLBACK ?? "off").trim().toLowerCase() === "on";
  return {
    provider,
    // Anthropic stays on the existing Haiku id for this sprint.
    model: DEFAULT_ANTHROPIC_MODEL,
    anthropicApiKey: env.ANTHROPIC_API_KEY?.trim() ?? "",
    fallbackEnabled: false,
    fallbackRequested,
    maxRepairRetries: WATCHLIST_AI_MAX_REPAIR_RETRIES,
  };
}

export function classifyQualityIssue(
  outcome:
    | { kind: "validation_failed"; reason: string }
    | ProviderTransportFailure
    | { kind: "ok"; explanation: string },
): WatchlistAiQualityIssue | null {
  if (outcome.kind === "ok") {
    const n = outcome.explanation.trim().length;
    if (n > 0 && n < 12) return "unusually_short_response";
    if (n > 200) return "unusually_long_response";
    return null;
  }
  if (outcome.kind === "transport_failure") {
    if (outcome.code === "RATE_LIMITED") return "rate_limited";
    if (outcome.code === "PROVIDER_TIMEOUT") return "provider_timeout";
    return "provider_error";
  }
  switch (outcome.reason) {
    case "unparseable_json":
    case "not_object":
      return "malformed_output";
    case "no_text":
    case "bad_explanation":
      return "missing_fields";
    case "bad_direction":
      return "invalid_direction";
    case "extra_key":
      return "extra_key";
    case "unknown_driver_id":
      return "unknown_driver_id";
    case "forbidden_key":
      return "forbidden_key";
    case "bad_driver_ids_type":
    case "bad_driver_ids_count":
    case "duplicate_driver_id":
      return "bad_driver_ids";
    default:
      return "parsing_failure";
  }
}

export function emitWatchlistAiQualityLog(input: {
  provider: WatchlistAiProviderId;
  model: string;
  issue: WatchlistAiQualityIssue;
  reason: string;
  retry_count: number;
  http_status: number | null;
}): void {
  const payload = {
    provider: input.provider,
    model: input.model,
    issue: input.issue,
    reason: input.reason.slice(0, 64),
    retry_count: input.retry_count,
    http_status: input.http_status,
  };
  console.warn(`${LOG_PREFIX} ai_quality ${JSON.stringify(payload)}`);
}

export function emitWatchlistAiCallLog(meta: WatchlistAiCallMeta, success: boolean, decision: string): void {
  const payload = {
    provider: meta.provider,
    model: meta.model,
    decision,
    success,
    latency_ms: meta.latency_ms,
    input_tokens: meta.usage.input_tokens,
    output_tokens: meta.usage.output_tokens,
    retry_count: meta.retry_count,
    http_status: meta.http_status,
    quality_issue: meta.quality_issue,
    fallback: "off" as const,
  };
  console.log(`${LOG_PREFIX} ai_call ${JSON.stringify(payload)}`);
}

function repairPrompt(original: string, reason: string): string {
  return `${original}

REPAIR: previous output was invalid (${reason}). Return ONLY the required JSON object with keys direction, explanation, driver_ids. No markdown.`;
}

export async function generateWatchlistAnalysis(
  adapter: WatchlistAiAdapter,
  input: WatchlistAiRequest,
  options?: { maxRepairRetries?: number; nowMs?: () => number },
): Promise<WatchlistAiCallResult> {
  const maxRetries = options?.maxRepairRetries ?? WATCHLIST_AI_MAX_REPAIR_RETRIES;
  const nowMs = options?.nowMs ?? Date.now;
  const started = nowMs();
  let retryCount = 0;
  let lastUsage: WatchlistAiUsage = { input_tokens: null, output_tokens: null };
  let lastStatus: number | null = null;
  let prompt = input.prompt;

  const meta = (
    quality_issue: WatchlistAiQualityIssue | null,
    extraUsage?: WatchlistAiUsage,
  ): WatchlistAiCallMeta => ({
    provider: adapter.id,
    model: adapter.model,
    latency_ms: Math.max(0, nowMs() - started),
    retry_count: retryCount,
    usage: extraUsage ?? lastUsage,
    http_status: lastStatus,
    quality_issue,
    fallback: "off",
  });

  while (true) {
    const raw = await adapter.complete(prompt);
    lastStatus = raw.http_status ?? null;
    if (raw.usage) lastUsage = raw.usage;

    if (raw.kind === "transport_failure") {
      const failure: ProviderTransportFailure = {
        kind: "transport_failure",
        code: raw.code ?? "PROVIDER_ERROR",
        http_status: raw.http_status ?? null,
        failure_kind: raw.failure_kind ?? "http_error",
      };
      const issue = classifyQualityIssue(failure);
      emitWatchlistAiQualityLog({
        provider: adapter.id,
        model: adapter.model,
        issue: issue ?? "provider_error",
        reason: failure.code,
        retry_count: retryCount,
        http_status: failure.http_status,
      });
      return { ...failure, meta: meta(issue) };
    }

    const rawText = raw.rawText ?? "";
    const validated = validateAiOutput(rawText, input.catalog);
    if (validated.kind === "ok") {
      const issue = classifyQualityIssue({ kind: "ok", explanation: validated.value.explanation });
      if (issue) {
        emitWatchlistAiQualityLog({
          provider: adapter.id,
          model: adapter.model,
          issue,
          reason: issue,
          retry_count: retryCount,
          http_status: lastStatus,
        });
      }
      return { kind: "ok", value: validated.value, meta: meta(issue) };
    }

    if (validated.kind !== "validation_failed") {
      return {
        kind: "validation_failed",
        reason: "parsing_failure",
        meta: meta("parsing_failure"),
      };
    }
    const issue = classifyQualityIssue(validated);
    emitWatchlistAiQualityLog({
      provider: adapter.id,
      model: adapter.model,
      issue: issue ?? "parsing_failure",
      reason: validated.reason,
      retry_count: retryCount,
      http_status: lastStatus,
    });

    if (retryCount >= maxRetries) {
      return { kind: "validation_failed", reason: validated.reason, meta: meta(issue) };
    }
    retryCount += 1;
    prompt = repairPrompt(input.prompt, validated.reason);
  }
}

export function createAnthropicAdapter(input: {
  apiKey: string;
  model: string;
}): WatchlistAiAdapter {
  const caller = makeAnthropicCaller(input.apiKey, input.model);
  return {
    id: "anthropic",
    model: input.model,
    async complete(prompt: string): Promise<WatchlistAiRawComplete> {
      const outcome = await caller.callRaw(prompt);
      if (outcome.kind === "transport_failure") return outcome;
      return {
        kind: "ok",
        rawText: outcome.rawText,
        usage: outcome.usage,
        http_status: outcome.http_status,
      };
    },
  };
}

export type CreateWatchlistAiResult =
  | { ok: true; adapter: WatchlistAiAdapter; config: WatchlistAiConfig }
  | { ok: false; reason: string; config: WatchlistAiConfig };

export function createWatchlistAiAdapter(
  config: WatchlistAiConfig,
): CreateWatchlistAiResult {
  if (config.fallbackRequested) {
    console.warn(`${LOG_PREFIX} WATCHLIST_AI_FALLBACK ignored; automatic fallback is off`);
  }
  if (config.provider !== "anthropic") {
    return { ok: false, reason: "provider_disabled", config };
  }
  if (!config.anthropicApiKey) {
    return { ok: false, reason: "missing_anthropic_key", config };
  }
  return {
    ok: true,
    adapter: createAnthropicAdapter({
      apiKey: config.anthropicApiKey,
      model: DEFAULT_ANTHROPIC_MODEL,
    }),
    config,
  };
}
