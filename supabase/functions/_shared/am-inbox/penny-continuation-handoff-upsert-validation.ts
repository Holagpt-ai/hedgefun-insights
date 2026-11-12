import {
  PENNY_CONTINUATION_MODEL_VERSION,
} from "../config/penny-continuation.config.ts";
import { PENNY_CONTINUATION_INTEGRATION_VERSION } from "../screeners/penny-continuation-integration-types.ts";
import { PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION } from "../screeners/penny-continuation-workflow-handoff-types.ts";
import type { PennyContinuationHandoffUpsertRow } from "./penny-continuation-workflow-persistence-types.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SUPPORTED_EVIDENCE = new Set(["live_market", "prior_session_capture"]);

export function isIsoDateString(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readBadge(
  row: Record<string, unknown>,
  symbol: string,
  sourceSessionDate: string,
): boolean {
  const badge = row.badge_payload;
  if (!isRecord(badge)) return false;
  if (badge.kind !== "penny_continuation_v1") return false;
  if (badge.model_version !== PENNY_CONTINUATION_MODEL_VERSION) return false;
  if (badge.continuationQualified !== true) return false;
  if (typeof badge.symbol !== "string" || badge.symbol.trim().toUpperCase() !== symbol) {
    return false;
  }
  if (badge.sessionDate !== sourceSessionDate) return false;
  const label = badge.dataFreshnessLabel;
  if (
    label !== null &&
    label !== "live" &&
    label !== "delayed" &&
    label !== "stale"
  ) {
    return false;
  }
  return true;
}

/** Bridge-level fail-closed validation before service-role RPC. */
export function validatePennyHandoffUpsertPayload(
  row: Record<string, unknown>,
): row is PennyContinuationHandoffUpsertRow {
  if (!isRecord(row)) return false;
  const symbol = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
  if (!symbol) return false;
  if (!isIsoDateString(row.source_session_date)) return false;
  const sourceSessionDate = row.source_session_date.trim();

  if (row.handoff_version !== PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION) return false;
  if (row.integration_version !== PENNY_CONTINUATION_INTEGRATION_VERSION) return false;
  if (row.model_version !== PENNY_CONTINUATION_MODEL_VERSION) return false;

  if (row.continuation_qualified !== true) return false;

  if (typeof row.publication_idempotency_key !== "string" || !row.publication_idempotency_key.trim()) {
    return false;
  }
  const idem = row.publication_idempotency_key.trim();
  if (!idem.includes(symbol) || !idem.includes(sourceSessionDate)) return false;

  const genMs = typeof row.generation_sync_ms === "number"
    ? row.generation_sync_ms
    : Number(row.generation_sync_ms);
  if (!Number.isFinite(genMs) || genMs < 0) return false;

  if (typeof row.generation_sync_at !== "string" || !Number.isFinite(Date.parse(row.generation_sync_at))) {
    return false;
  }
  const parsedGenMs = Date.parse(row.generation_sync_at);
  if (Math.abs(parsedGenMs - genMs) > 5_000) return false;

  if (typeof row.capture_at !== "string" || !Number.isFinite(Date.parse(row.capture_at))) {
    return false;
  }
  const captureMs = Date.parse(row.capture_at);
  if (row.symbol_observation_at != null && row.symbol_observation_at !== "") {
    if (
      typeof row.symbol_observation_at !== "string" ||
      !Number.isFinite(Date.parse(row.symbol_observation_at))
    ) {
      return false;
    }
    if (Date.parse(row.symbol_observation_at) > captureMs) return false;
  }

  if (
    typeof row.qualification_evidence_kind !== "string" ||
    !SUPPORTED_EVIDENCE.has(row.qualification_evidence_kind)
  ) {
    return false;
  }

  if (!isIsoDateString(row.valid_from_session_date)) return false;
  if (!isIsoDateString(row.valid_through_session_date)) return false;
  const validFrom = row.valid_from_session_date.trim();
  const validThrough = row.valid_through_session_date.trim();
  if (validFrom > validThrough) return false;

  if (row.qualification_evidence_kind === "live_market") {
    const badge = row.badge_payload;
    const supplemental = isRecord(badge) && Array.isArray(badge.supplementalLabels)
      ? badge.supplementalLabels
      : [];
    const nextCarry = supplemental.includes("next_session_carry");
    if (validFrom === sourceSessionDate && validThrough === sourceSessionDate) {
      // same-session live
    } else if (
      nextCarry &&
      validFrom > sourceSessionDate &&
      validThrough === validFrom
    ) {
      // live capture with explicit next-session carry window
    } else {
      return false;
    }
  } else if (validFrom <= sourceSessionDate || validThrough !== validFrom) {
    return false;
  }

  if (!readBadge(row, symbol, sourceSessionDate)) return false;

  return true;
}
