// Watchlist V2 intelligence provider abstraction.
// Analyzer code calls generateWatchlistAnalysis only.
// Active provider: Anthropic Haiku. Automatic cross-provider fallback is OFF.

import type { EvidenceCatalog } from "./ai-read.ts";
import { makeAnthropicCaller, validateAiOutput, type AiReadResult } from "./ai-read.ts";
import type { ProviderTransportFailure } from "./market-data.ts";
import { LOG_PREFIX } from "./sanitize.ts";
import { classifyHttpFailure, logAiRequest } from "../ai/normalized-failure.ts";
import { failureCodeFromCategory } from "../ai/failure-codes.ts";
import {
  AI_MAX_TRANSPORT_ATTEMPTS,
  computeRetryDelayMs,
  shouldRetryTransportFailure,
} from "../ai/retry-policy.ts";

export type WatchlistAiProviderId = "anthropic" | "qwen";

export const DEFAULT_WATCHLIST_AI_PROVIDER: WatchlistAiProviderId = "anthropic";
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
export const WATCHLIST_AI_MAX_REPAIR_RETRIES = 1;
export const WATCHLIST_AI_FALLBACK_ENABLED = false;

export type WatchlistTriggerType = "manual" | "trigger" | "batch";

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
  fallback: "off" | "used";
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
  provider_error_type?: string | null;
  provider_error_message?: string | null;
}

export interface WatchlistAiAdapter {
  readonly id: WatchlistAiProviderId;
  readonly model: string;
  complete(prompt: string): Promise<WatchlistAiRawComplete>;
}

export interface WatchlistAnalysisOptions {
  maxRepairRetries?: number;
  nowMs?: () => number;
  fallback?: WatchlistAiAdapter | null;
  requestId?: string;
  triggerType?: WatchlistTriggerType;
  providerTimeoutMs?: number;
  transportWallClockBudgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
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
    fallback: meta.fallback,
  };
  console.log(`${LOG_PREFIX} ai_call ${JSON.stringify(payload)}`);
}

function repairPrompt(original: string, reason: string): string {
  return `${original}

REPAIR: previous output was invalid (${reason}). Return ONLY the required JSON object with keys direction, explanation, driver_ids. No markdown.`;
}

function logWatchlistAiRequest(input: {
  attempt: number;
  triggerType: WatchlistTriggerType;
  requestId?: string;
  adapter: WatchlistAiAdapter;
  durationMs: number;
  outcome: string;
  schemaValid: boolean | null;
  failureCategory: ReturnType<typeof classifyHttpFailure> | null;
  httpStatus: number | null;
  fallbackUsed: boolean;
  transportFailure?: ProviderTransportFailure;
}): void {
  logAiRequest({
    surface: "watchlist_v2",
    provider: input.adapter.id,
    model: input.adapter.model,
    attempt: input.attempt,
    fallbackUsed: input.fallbackUsed,
    durationMs: input.durationMs,
    outcome: input.outcome,
    schemaValid: input.schemaValid,
    evidenceSufficient: true,
    failureCategory: input.failureCategory,
    requestId: input.requestId ?? null,
    feature: "watchlist_v2",
    triggerType: input.triggerType,
    failureCode: input.failureCategory
      ? failureCodeFromCategory(input.failureCategory, {
        network: input.transportFailure?.failure_kind === "fetch_error",
      })
      : null,
    providerStatus: input.httpStatus,
  });
}

function isTransientTransportFailure(failure: ProviderTransportFailure): boolean {
  return shouldRetryTransportFailure({
    httpStatus: failure.http_status,
    timedOut: failure.code === "PROVIDER_TIMEOUT",
    network: failure.failure_kind === "fetch_error",
    outcome: "provider_error",
    attempt: 1,
    maxAttempts: AI_MAX_TRANSPORT_ATTEMPTS + 1,
  });
}

function canRetryWithinBudget(input: {
  startedMs: number;
  nowMs: () => number;
  delayMs: number;
  providerTimeoutMs: number;
  budgetMs: number | undefined;
}): boolean {
  if (input.budgetMs === undefined) return true;
  const elapsed = input.nowMs() - input.startedMs;
  return elapsed + input.delayMs + input.providerTimeoutMs <= input.budgetMs;
}

export async function generateWatchlistAnalysis(
  adapter: WatchlistAiAdapter,
  input: WatchlistAiRequest,
  options?: WatchlistAnalysisOptions,
): Promise<WatchlistAiCallResult> {
  const maxRepairRetries = options?.maxRepairRetries ?? WATCHLIST_AI_MAX_REPAIR_RETRIES;
  const nowMs = options?.nowMs ?? Date.now;
  const sleep = options?.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const triggerType = options?.triggerType ?? "manual";
  const requestId = options?.requestId;
  const providerTimeoutMs = options?.providerTimeoutMs ?? 20_000;
  const transportBudgetMs = options?.transportWallClockBudgetMs;

  const started = nowMs();
  let repairCount = 0;
  let transportRetries = 0;
  let usingFallback = false;
  let active = adapter;
  let lastUsage: WatchlistAiUsage = { input_tokens: null, output_tokens: null };
  let lastStatus: number | null = null;
  let prompt = input.prompt;
  let providerCallAttempt = 0;

  const meta = (
    quality_issue: WatchlistAiQualityIssue | null,
    extraUsage?: WatchlistAiUsage,
  ): WatchlistAiCallMeta => ({
    provider: active.id,
    model: active.model,
    latency_ms: Math.max(0, nowMs() - started),
    retry_count: transportRetries + repairCount,
    usage: extraUsage ?? lastUsage,
    http_status: lastStatus,
    quality_issue,
    fallback: usingFallback ? "used" : "off",
  });

  while (true) {
    providerCallAttempt += 1;
    const attemptStarted = nowMs();
    const raw = await active.complete(prompt);
    lastStatus = raw.http_status ?? null;
    if (raw.usage) lastUsage = raw.usage;
    const transportFailure = raw.kind === "transport_failure";

    if (transportFailure) {
      const failure: ProviderTransportFailure = {
        kind: "transport_failure",
        code: raw.code ?? "PROVIDER_ERROR",
        http_status: raw.http_status ?? null,
        failure_kind: raw.failure_kind ?? "http_error",
        provider_error_type: raw.provider_error_type ?? null,
        provider_error_message: raw.provider_error_message ?? null,
      };
      const transportCategory = classifyHttpFailure({
        httpStatus: failure.http_status,
        timedOut: failure.code === "PROVIDER_TIMEOUT" || failure.http_status === null,
      });
      logWatchlistAiRequest({
        attempt: providerCallAttempt,
        triggerType,
        requestId,
        adapter: active,
        durationMs: Math.max(0, nowMs() - attemptStarted),
        outcome: raw.kind,
        schemaValid: null,
        failureCategory: transportCategory,
        httpStatus: failure.http_status,
        fallbackUsed: usingFallback,
        transportFailure: failure,
      });

      const retrySameProvider = shouldRetryTransportFailure({
        httpStatus: failure.http_status,
        timedOut: failure.code === "PROVIDER_TIMEOUT",
        network: failure.failure_kind === "fetch_error",
        outcome: "provider_error",
        attempt: providerCallAttempt,
        maxAttempts: AI_MAX_TRANSPORT_ATTEMPTS,
      });

      if (!usingFallback && retrySameProvider) {
        const delayMs = computeRetryDelayMs(providerCallAttempt);
        if (canRetryWithinBudget({
          startedMs: started,
          nowMs,
          delayMs,
          providerTimeoutMs,
          budgetMs: transportBudgetMs,
        })) {
          transportRetries += 1;
          await sleep(delayMs);
          continue;
        }
      }

      if (!usingFallback && isTransientTransportFailure(failure) && options?.fallback) {
        usingFallback = true;
        active = options.fallback;
        prompt = input.prompt;
        continue;
      }

      const issue = classifyQualityIssue(failure);
      emitWatchlistAiQualityLog({
        provider: active.id,
        model: active.model,
        issue: issue ?? "provider_error",
        reason: failure.code,
        retry_count: transportRetries + repairCount,
        http_status: failure.http_status,
      });
      return { ...failure, meta: meta(issue) };
    }

    const rawText = raw.rawText ?? "";
    const validated = validateAiOutput(rawText, input.catalog);
    const schemaFailed = validated.kind !== "ok";
    const schemaCategory = schemaFailed
      ? (validated.kind === "validation_failed"
        && (validated.reason === "unparseable_json" || validated.reason === "not_object")
        ? "MALFORMED_RESPONSE"
        : "SCHEMA_VALIDATION")
      : null;

    logWatchlistAiRequest({
      attempt: providerCallAttempt,
      triggerType,
      requestId,
      adapter: active,
      durationMs: Math.max(0, nowMs() - attemptStarted),
      outcome: validated.kind,
      schemaValid: !schemaFailed,
      failureCategory: schemaCategory,
      httpStatus: lastStatus,
      fallbackUsed: usingFallback,
    });

    if (validated.kind === "ok") {
      const issue = classifyQualityIssue({ kind: "ok", explanation: validated.value.explanation });
      if (issue) {
        emitWatchlistAiQualityLog({
          provider: active.id,
          model: active.model,
          issue,
          reason: issue,
          retry_count: transportRetries + repairCount,
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
      provider: active.id,
      model: active.model,
      issue: issue ?? "parsing_failure",
      reason: validated.reason,
      retry_count: transportRetries + repairCount,
      http_status: lastStatus,
    });

    if (repairCount >= maxRepairRetries) {
      return { kind: "validation_failed", reason: validated.reason, meta: meta(issue) };
    }
    repairCount += 1;
    prompt = repairPrompt(input.prompt, validated.reason);
  }
}

export function createAnthropicAdapter(input: {
  apiKey: string;
  model: string;
  timeoutMs: number;
  requestId?: string;
}): WatchlistAiAdapter {
  const caller = makeAnthropicCaller(input.apiKey, input.model, {
    timeoutMs: input.timeoutMs,
    requestId: input.requestId,
  });
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
  runtime?: { timeoutMs: number; requestId?: string },
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
  if (!runtime?.timeoutMs || !Number.isFinite(runtime.timeoutMs)) {
    return { ok: false, reason: "missing_provider_timeout", config };
  }
  return {
    ok: true,
    adapter: createAnthropicAdapter({
      apiKey: config.anthropicApiKey,
      model: DEFAULT_ANTHROPIC_MODEL,
      timeoutMs: runtime.timeoutMs,
      requestId: runtime.requestId,
    }),
    config,
  };
}
