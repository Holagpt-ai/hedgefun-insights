// V1B processor request contract. Default mode is dry_run. Write is never implied.

import { TICKER_REGEX } from "../catalyst/contract.ts";

export const PROCESSOR_MAX_BODY_BYTES = 4096;
export const DEFAULT_LIMIT = 50;
export const HARD_MAX_LIMIT = 500;
export const WRITE_ENABLED_VALUE = "true";

export type IntelligenceProcessMode = "dry_run" | "write";

export interface IntelligenceSelection {
  limit: number;
  catalyst_event_id: string | null;
  since: string | null;
  symbols: string[] | null;
  provider: string | null;
}

export interface ParsedProcessorRequest {
  mode: IntelligenceProcessMode;
  selection: IntelligenceSelection;
}

export type ProcessorParseResult =
  | { ok: true; request: ParsedProcessorRequest }
  | { ok: false; reason: "VALIDATION_ERROR" };

const ALLOWED_KEYS = new Set([
  "mode",
  "limit",
  "catalyst_event_id",
  "since",
  "symbols",
  "provider",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isIntelligenceWriteEnabled(envValue: string | undefined | null): boolean {
  return envValue === WRITE_ENABLED_VALUE;
}

function isIsoDatetime(raw: string): boolean {
  if (raw.trim().length === 0) return false;
  const ms = Date.parse(raw);
  return Number.isFinite(ms);
}

function parseLimit(raw: unknown): number | null {
  if (raw === undefined) return DEFAULT_LIMIT;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) return null;
  return Math.min(raw, HARD_MAX_LIMIT);
}

function parseSymbols(raw: unknown): string[] | null | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 50) return null;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const symbol = item.trim().toUpperCase();
    if (!TICKER_REGEX.test(symbol)) return null;
    out.push(symbol);
  }
  return out;
}

export function parseProcessorRequestBody(raw: string | null | undefined): ProcessorParseResult {
  const text = typeof raw === "string" ? raw : "";
  if (new TextEncoder().encode(text).length > PROCESSOR_MAX_BODY_BYTES) {
    return { ok: false, reason: "VALIDATION_ERROR" };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return {
      ok: true,
      request: {
        mode: "dry_run",
        selection: {
          limit: DEFAULT_LIMIT,
          catalyst_event_id: null,
          since: null,
          symbols: null,
          provider: null,
        },
      },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: "VALIDATION_ERROR" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "VALIDATION_ERROR" };
  }

  const obj = parsed as Record<string, unknown>;
  if (Object.keys(obj).some((k) => !ALLOWED_KEYS.has(k))) {
    return { ok: false, reason: "VALIDATION_ERROR" };
  }

  let mode: IntelligenceProcessMode = "dry_run";
  if (Object.prototype.hasOwnProperty.call(obj, "mode")) {
    if (obj.mode !== "dry_run" && obj.mode !== "write") {
      return { ok: false, reason: "VALIDATION_ERROR" };
    }
    mode = obj.mode;
  }

  const limit = parseLimit(obj.limit);
  if (limit === null) return { ok: false, reason: "VALIDATION_ERROR" };

  let catalystEventId: string | null = null;
  if (obj.catalyst_event_id !== undefined) {
    if (typeof obj.catalyst_event_id !== "string" || !UUID_RE.test(obj.catalyst_event_id)) {
      return { ok: false, reason: "VALIDATION_ERROR" };
    }
    catalystEventId = obj.catalyst_event_id.toLowerCase();
  }

  let since: string | null = null;
  if (obj.since !== undefined) {
    if (typeof obj.since !== "string" || !isIsoDatetime(obj.since)) {
      return { ok: false, reason: "VALIDATION_ERROR" };
    }
    since = new Date(Date.parse(obj.since)).toISOString();
  }

  const symbolsParsed = parseSymbols(obj.symbols);
  if (symbolsParsed === null) return { ok: false, reason: "VALIDATION_ERROR" };

  let provider: string | null = null;
  if (obj.provider !== undefined) {
    if (typeof obj.provider !== "string" || obj.provider.trim().length === 0 || obj.provider.length > 64) {
      return { ok: false, reason: "VALIDATION_ERROR" };
    }
    provider = obj.provider.trim().toLowerCase();
  }

  return {
    ok: true,
    request: {
      mode,
      selection: {
        limit,
        catalyst_event_id: catalystEventId,
        since,
        symbols: symbolsParsed ?? null,
        provider,
      },
    },
  };
}
