import {
  computeValidThroughSessionDate,
  firstAmSessionDateAfterSource,
} from "./late-session-expiry.ts";
import { v22CandidateToContinuationInput } from "./v22-to-continuation-input.ts";
import {
  isLateSessionSourceCategory,
  type LateSessionSourceCategory,
  LATE_SESSION_SOURCE_CATEGORIES,
} from "../config/late-session-source-categories.ts";
import type { RadarV22CandidateRow, RadarV22SessionKind } from "../radar-v22/persistence-v2.ts";
import { evaluateContinuation } from "../screeners/continuation-v1.ts";
import { SCANNER_EVENT_DISPLAY } from "../radar-v22/scanner-events.ts";

export type LateSessionHandoffUpsertRow = Record<string, unknown>;

const CAPTURE_SESSION_KINDS: ReadonlySet<RadarV22SessionKind> = new Set([
  "market",
  "after-hours",
]);

function pickPrimaryLateSessionCategory(
  categories: readonly LateSessionSourceCategory[],
): LateSessionSourceCategory {
  for (const category of LATE_SESSION_SOURCE_CATEGORIES) {
    if (categories.includes(category)) return category;
  }
  return categories[0]!;
}

function scannerEvidenceLabels(row: RadarV22CandidateRow): string[] {
  const labels: string[] = [];
  const primary = row.primary_scanner_event?.trim();
  if (primary && primary in SCANNER_EVENT_DISPLAY) {
    labels.push(SCANNER_EVENT_DISPLAY[primary as keyof typeof SCANNER_EVENT_DISPLAY]);
  }
  return labels;
}

function buildUpsertRow(input: {
  symbol: string;
  securityId: string | null;
  sourceSessionDate: string;
  sourceTimestamp: string;
  sourceCategory: LateSessionSourceCategory;
  candidate: RadarV22CandidateRow;
  captureFreshnessClass: string | null;
}): LateSessionHandoffUpsertRow {
  const validFrom = firstAmSessionDateAfterSource(input.sourceSessionDate);
  const validThrough = computeValidThroughSessionDate(
    input.sourceSessionDate,
    input.sourceCategory,
  );
  const row = input.candidate;
  const dollarVolume = row.last_price !== null && row.session_volume >= 0
    ? row.last_price * row.session_volume
    : null;
  return {
    security_id: input.securityId,
    symbol: input.symbol.trim().toUpperCase(),
    source_session_date: input.sourceSessionDate,
    source_timestamp: input.sourceTimestamp,
    source_category: input.sourceCategory,
    last_price: row.last_price,
    session_move_pct: row.move_60s_pct,
    volume: row.session_volume,
    rvol: row.rvol_5m,
    dollar_volume: Number.isFinite(dollarVolume) ? dollarVolume : null,
    close_distance_from_hod_pct: row.distance_from_hod_pct,
    after_hours_extends: null,
    catalyst_present: null,
    float_turnover: null,
    historical_context_available: false,
    evidence_labels: scannerEvidenceLabels(row),
    sample_size_quality: null,
    comparable_episode_count: null,
    most_recent_comparable_date: null,
    profile_freshness: "UNKNOWN",
    valid_from_session_date: validFrom,
    valid_through_session_date: validThrough,
    capture_freshness_class: input.captureFreshnessClass,
  };
}

/**
 * Evaluates Radar V2 candidates with the canonical continuation engine.
 * Returns upsert rows only — caller persists via bridge RPC (no rank changes).
 */
export function buildLateSessionHandoffUpsertsFromV22Candidates(input: {
  tradingDate: string;
  sessionKind: RadarV22SessionKind;
  syncedAt: string;
  candidates: readonly RadarV22CandidateRow[];
}): LateSessionHandoffUpsertRow[] {
  if (!CAPTURE_SESSION_KINDS.has(input.sessionKind)) return [];
  const out: LateSessionHandoffUpsertRow[] = [];
  for (const candidate of input.candidates) {
    if (!candidate.symbol?.trim()) continue;
    const continuation = evaluateContinuation(v22CandidateToContinuationInput(candidate));
    const categories = continuation.categories.filter(isLateSessionSourceCategory);
    if (categories.length === 0) continue;
    const primary = pickPrimaryLateSessionCategory(categories);
    out.push(
      buildUpsertRow({
        symbol: candidate.symbol,
        securityId: null,
        sourceSessionDate: input.tradingDate,
        sourceTimestamp: input.syncedAt,
        sourceCategory: primary,
        candidate,
        captureFreshnessClass: candidate.freshness_class ?? null,
      }),
    );
  }
  return out;
}
