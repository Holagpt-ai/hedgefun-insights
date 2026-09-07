// V1B activation controls: request-mode contract and write-enable gate.
// Endpoints, form lists, and rate limits are server-fixed and not caller-overridable.

export const SEC_SYNC_MAX_BODY_BYTES = 256;
export const SEC_EDGAR_WRITE_ENABLED_VALUE = "true";

export type SecSyncMode = "dry_run" | "write";

export type SecModeParseResult =
  | { ok: true; mode: SecSyncMode }
  | { ok: false; reason: "VALIDATION_ERROR" };

const ALLOWED_KEYS = new Set(["mode"]);

/**
 * SEC discovery is independent of NYSE/Nasdaq session calendars.
 * A market holiday must never disable filing ingestion.
 */
export function shouldSkipSecDiscoveryForMarketHoliday(
  _isMarketHoliday: boolean,
): boolean {
  return false;
}

export function isSecEdgarWriteEnabled(envValue: string | undefined | null): boolean {
  return envValue === SEC_EDGAR_WRITE_ENABLED_VALUE;
}

export function parseSecSyncRequestBody(raw: string | null | undefined): SecModeParseResult {
  const text = typeof raw === "string" ? raw : "";
  if (new TextEncoder().encode(text).length > SEC_SYNC_MAX_BODY_BYTES) {
    return { ok: false, reason: "VALIDATION_ERROR" };
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) return { ok: true, mode: "dry_run" };

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
  const keys = Object.keys(obj);
  if (keys.some((k) => !ALLOWED_KEYS.has(k))) {
    return { ok: false, reason: "VALIDATION_ERROR" };
  }
  if (!Object.prototype.hasOwnProperty.call(obj, "mode")) {
    return { ok: true, mode: "dry_run" };
  }
  if (obj.mode === "dry_run" || obj.mode === "write") {
    return { ok: true, mode: obj.mode };
  }
  return { ok: false, reason: "VALIDATION_ERROR" };
}

export function countIncludedForms(
  formTypes: readonly string[],
  included: ReadonlySet<string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const form of formTypes) {
    if (!included.has(form)) continue;
    out[form] = (out[form] ?? 0) + 1;
  }
  return out;
}

export interface SecActivationSummary {
  mode: SecSyncMode;
  feed_entries_read: number;
  relevant_forms_found: number;
  mapped_issuers: number;
  unmapped_issuers: number;
  rows_validated: number;
  rows_existing: number;
  rows_would_insert: number;
  rows_upserted: number;
  rows_skipped_existing: number;
  rows_rejected: number;
  sec_requests: number;
  forms_found: Record<string, number>;
}

export function sanitizeActivationSummary(input: SecActivationSummary): SecActivationSummary {
  const nn = (n: number) =>
    (typeof n === "number" && Number.isFinite(n) && n >= 0) ? Math.floor(n) : 0;
  const forms: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.forms_found ?? {})) {
    if (typeof k === "string" && k.length > 0 && k.length <= 16) forms[k] = nn(v);
  }
  return {
    mode: input.mode === "write" ? "write" : "dry_run",
    feed_entries_read: nn(input.feed_entries_read),
    relevant_forms_found: nn(input.relevant_forms_found),
    mapped_issuers: nn(input.mapped_issuers),
    unmapped_issuers: nn(input.unmapped_issuers),
    rows_validated: nn(input.rows_validated),
    rows_existing: nn(input.rows_existing),
    rows_would_insert: nn(input.rows_would_insert),
    rows_upserted: nn(input.rows_upserted),
    rows_skipped_existing: nn(input.rows_skipped_existing),
    rows_rejected: nn(input.rows_rejected),
    sec_requests: nn(input.sec_requests),
    forms_found: forms,
  };
}
