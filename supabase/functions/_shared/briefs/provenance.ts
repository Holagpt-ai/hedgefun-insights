import { AM_INDEX_SYMBOLS, AM_V2_SOURCE, AM_V2_VERSION } from "./am-evidence.ts";

export const PM_V1_SOURCE = "market_indexes";

function isValidIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isValidTimestamp(s: unknown): boolean {
  if (typeof s !== "string" || !s) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

export interface BriefRowLike {
  brief_type: string;
  brief_date: string;
  content: string;
  generated_at: string;
  market_snapshot: unknown;
}

export type ProvenanceResult =
  | { ok: true; sourceCheckedAt: string }
  | { ok: false; reason: "invalid_brief_provenance" };

function baseRowOk(row: BriefRowLike, expectedType: "am" | "pm"): boolean {
  if (row.brief_type !== expectedType) return false;
  if (!isValidIsoDate(row.brief_date)) return false;
  if (!isValidTimestamp(row.generated_at)) return false;
  if (typeof row.content !== "string" || row.content.trim().length === 0) return false;
  if (!row.market_snapshot || typeof row.market_snapshot !== "object" || Array.isArray(row.market_snapshot)) {
    return false;
  }
  return true;
}

/** PM V1: four-ETF market_indexes snapshot. Unchanged from pre-V2. */
export function validatePmV1Provenance(row: BriefRowLike): ProvenanceResult {
  if (!baseRowOk(row, "pm")) return { ok: false, reason: "invalid_brief_provenance" };
  const s = row.market_snapshot as Record<string, unknown>;
  if (s.source !== PM_V1_SOURCE) return { ok: false, reason: "invalid_brief_provenance" };
  if (!isValidTimestamp(s.source_checked_at)) return { ok: false, reason: "invalid_brief_provenance" };
  return { ok: true, sourceCheckedAt: s.source_checked_at as string };
}

/**
 * AM V2: explicit intelligence provenance.
 * Legacy AM rows with source === "market_indexes" fail closed (must not masquerade as V2).
 */
export function validateAmV2Provenance(row: BriefRowLike): ProvenanceResult {
  if (!baseRowOk(row, "am")) return { ok: false, reason: "invalid_brief_provenance" };
  const s = row.market_snapshot as Record<string, unknown>;
  if (s.source === PM_V1_SOURCE) return { ok: false, reason: "invalid_brief_provenance" };
  if (s.source !== AM_V2_SOURCE) return { ok: false, reason: "invalid_brief_provenance" };
  if (s.version !== AM_V2_VERSION) return { ok: false, reason: "invalid_brief_provenance" };
  const checked =
    (typeof s.evidence_checked_at === "string" && s.evidence_checked_at) ||
    (typeof s.source_checked_at === "string" && s.source_checked_at) ||
    "";
  if (!isValidTimestamp(checked)) return { ok: false, reason: "invalid_brief_provenance" };
  if (typeof s.fingerprint !== "string" || s.fingerprint.trim().length === 0) {
    return { ok: false, reason: "invalid_brief_provenance" };
  }
  const indexes = s.indexes;
  if (!indexes || typeof indexes !== "object" || Array.isArray(indexes)) {
    return { ok: false, reason: "invalid_brief_provenance" };
  }
  const idx = indexes as Record<string, unknown>;
  for (const sym of AM_INDEX_SYMBOLS) {
    const rowIdx = idx[sym];
    if (!rowIdx || typeof rowIdx !== "object" || Array.isArray(rowIdx)) {
      return { ok: false, reason: "invalid_brief_provenance" };
    }
    const r = rowIdx as Record<string, unknown>;
    if (typeof r.current_value !== "number" || !Number.isFinite(r.current_value) || r.current_value <= 0) {
      return { ok: false, reason: "invalid_brief_provenance" };
    }
    if (typeof r.change_percent !== "number" || !Number.isFinite(r.change_percent)) {
      return { ok: false, reason: "invalid_brief_provenance" };
    }
  }
  for (const key of ["headlines", "catalysts", "earnings"] as const) {
    if (!Array.isArray(s[key])) return { ok: false, reason: "invalid_brief_provenance" };
  }
  return { ok: true, sourceCheckedAt: checked };
}

export function validateBriefProvenance(
  row: BriefRowLike,
  expectedType: "am" | "pm",
): ProvenanceResult {
  if (expectedType === "pm") return validatePmV1Provenance(row);
  return validateAmV2Provenance(row);
}
