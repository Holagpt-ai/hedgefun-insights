/**
 * Radar V2 → Pre-Market Screeners consumer adapter (D5).
 *
 * Pure, side-effect-free mapping from Radar Persistence V2 candidate rows
 * (`radar_v22_candidates`) + V2 feed state (`radar_v22_feed_state` V2 columns)
 * into the existing `ScreenerResultRow` view model consumed by the Screeners
 * page. No Supabase access lives here — the data-layer source hook wires the
 * fetch and calls `buildRadarV2Decision`.
 *
 * Product principle: VOLUME IS KING. Candidates reach the frontend before the
 * narrow per-tab filters decide sub-tab membership.
 *
 * Honesty rules:
 *  - RVOL is not persisted by Radar V2 → `rvol` stays null → UI renders `—`.
 *  - No prior-close is persisted → `gap_percent` / `prior_session_volume` /
 *    `volume_ratio_prior_session` / 52w fields stay null (rendered `—`).
 *  - No confirmed prior-close percentage change exists pre-market, so
 *    `change_percent` is left null (rendered `—`). Radar only persists a
 *    short-window move (move_60s_pct / move_15s_pct); surfacing that in a column
 *    labeled "Move"/"% Change" would mislabel it as a day/session change, so it
 *    is intentionally NOT mapped into `change_percent`. It still contributes to
 *    volume-first tie-breaking during ranking.
 *  - Stale/unavailable Radar data is never shown as live; caller falls back.
 */

import {
  SCREENER_STALE_AFTER_MS,
  MAX_TAB_ROWS,
  parseTimestampMs,
  isFiniteNumber,
  isPositiveFinite,
  type ScreenerResultRow,
  type ScreenerUiStatus,
} from "@/lib/screeners/contract";
import type { RadarRankingFields } from "@/features/day-trade-radar-v2/types";

/**
 * Radar-backed screener row: the standard row plus the OPTIONAL Radar ranking
 * metadata the Day Trade Radar board already understands. It is assignable to
 * `ScreenerResultRow`, so no global contract change is required; non-Radar
 * consumers simply ignore the extra fields.
 */
export type RadarV2ScreenerRow = ScreenerResultRow & RadarRankingFields;

// ── Session model (explicit; PM/RTH/AH-ready) ───────────────────────────────

export const RADAR_V2_SESSION_KINDS = [
  "pre-market",
  "market",
  "after-hours",
  "closed",
] as const;

export type RadarV2SessionKind = (typeof RADAR_V2_SESSION_KINDS)[number];

/**
 * Sessions where Radar V2 is the PREFERRED screener source in THIS sprint.
 * Architecture supports market / after-hours, but D5 activates pre-market only.
 * Widening this set is the single switch to activate later sessions.
 */
export const RADAR_V2_ACTIVE_SESSIONS: ReadonlySet<RadarV2SessionKind> = new Set([
  "pre-market",
]);

// ── Tab eligibility (do not make every tab identical) ───────────────────────

/**
 * Tabs that consume the Radar V2 candidate universe during an active session.
 *  - day_trade_radar : Radar-backed (PM candidate universe; no RTH gate).
 *  - volume_spikes   : partially Radar-backed (session/velocity volume evidence).
 *  - unusual_volume  : partially Radar-backed (velocity/anomaly evidence; no RVOL).
 *  - gainers_losers  : partially Radar-backed (short-window Radar move).
 *
 * Intentionally NOT Radar-backed pre-market (kept on the existing path, which is
 * an honest empty during PM):
 *  - gappers        : no persisted prior-close → cannot compute honest gap.
 *  - new_highs_lows : RTH 52-week semantics are not valid pre-market.
 */
export const RADAR_V2_BACKED_TABS: ReadonlySet<string> = new Set([
  "day_trade_radar",
  "volume_spikes",
  "unusual_volume",
  "gainers_losers",
]);

/** Full board tabs render the whole ranked board; table tabs keep the 20-row cap. */
const RADAR_V2_FULL_BOARD_TABS: ReadonlySet<string> = new Set(["day_trade_radar"]);

/** Hard cap mirrors the Sentinel promotion hard cap. */
export const RADAR_V2_CANDIDATE_CAP = 200;

// ── Freshness ───────────────────────────────────────────────────────────────

/**
 * Reuse the Screener staleness threshold. Massive tape is intentionally ~15 min
 * delayed; this threshold gates PIPELINE liveness (v2_synced_at), not provider
 * realtime. Nothing here claims "Live".
 */
export const RADAR_V2_STALE_AFTER_MS = SCREENER_STALE_AFTER_MS;

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]*$/;

const FRESHNESS_ORDER: Record<string, number> = {
  fresh: 0,
  active: 1,
  cooling: 2,
  stale: 3,
  unknown: 4,
};

// ── Row shapes consumed from Supabase (narrow mirrors; do not invent fields) ──

export interface RadarV2CandidateRow {
  symbol: string;
  generation_id: string;
  trading_date: string;
  session_kind: string;
  lifecycle: string;
  signal_status: string;
  last_price: number | null;
  move_15s_pct: number | null;
  move_60s_pct: number | null;
  volume_5s: number | null;
  volume_15s: number | null;
  volume_60s: number | null;
  session_volume: number | null;
  dollar_volume_60s: number | null;
  acceleration_5m: number | null;
  session_high: number | null;
  session_low: number | null;
  distance_from_hod_pct: number | null;
  session_vwap: number | null;
  vwap_side: string | null;
  freshness_class: string | null;
  provider_as_of: string | null;
  updated_at: string;
}

export interface RadarV2FeedStateRow {
  state_key: string;
  session_kind: string | null;
  sentinel_enabled: boolean | null;
  candidate_count: number | null;
  v2_generation_id: string | null;
  v2_synced_at: string | null;
  last_receive_at: string | null;
  last_provider_event_at: string | null;
  /**
   * LEGACY V1 feed-health flag (driven by the V1 publish_generation path).
   * Diagnostics ONLY. It can be `true` while the V2 pipeline is fully healthy,
   * so it MUST NOT gate Radar V2 candidate health. See `buildRadarV2Decision`.
   */
  feed_stale: boolean | null;
  updated_at: string;
}

export interface RadarV2ScreenerView {
  status: Exclude<ScreenerUiStatus, "loading">;
  rows: ScreenerResultRow[];
  synced_at: string | null;
  provider_as_of_max: string | null;
}

export interface RadarV2Decision {
  /** "radar-v2" → caller applies `view`; "fallback" → caller uses existing path. */
  source: "radar-v2" | "fallback";
  /** Machine-readable reason (diagnostics / tests). */
  reason: string;
  /** Session the decision was made for (never relabels). */
  session: string | null;
  view: RadarV2ScreenerView | null;
}

// ── Predicates ──────────────────────────────────────────────────────────────

export function isRadarV2SessionKind(v: unknown): v is RadarV2SessionKind {
  return typeof v === "string" &&
    (RADAR_V2_SESSION_KINDS as readonly string[]).includes(v);
}

export function isRadarV2ActiveSession(session: unknown): session is RadarV2SessionKind {
  return isRadarV2SessionKind(session) && RADAR_V2_ACTIVE_SESSIONS.has(session);
}

export function isRadarV2BackedTab(tabId: string): boolean {
  return RADAR_V2_BACKED_TABS.has(tabId);
}

export function tabDisplayLimit(tabId: string): number {
  return RADAR_V2_FULL_BOARD_TABS.has(tabId) ? RADAR_V2_CANDIDATE_CAP : MAX_TAB_ROWS;
}

function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  if (!s || s.length > 12 || !SYMBOL_RE.test(s)) return null;
  return s;
}

/** A candidate is structurally valid if symbol is well-formed and volume is a real number. */
export function isValidRadarV2Candidate(row: RadarV2CandidateRow): boolean {
  if (normalizeSymbol(row.symbol) === null) return false;
  // Volume is king: session_volume must be a finite, non-negative number.
  if (!isFiniteNumber(row.session_volume) || (row.session_volume as number) < 0) {
    return false;
  }
  return true;
}

// ── Ranking: VOLUME IS KING ─────────────────────────────────────────────────

/** Numeric sort key; missing/NaN sorts last for descending comparisons. */
function descKey(v: number | null | undefined): number {
  return isFiniteNumber(v) ? (v as number) : Number.NEGATIVE_INFINITY;
}

/** Absolute price movement (short-window); missing sorts last. */
function moveMagnitude(row: RadarV2CandidateRow): number {
  const m = isFiniteNumber(row.move_60s_pct)
    ? (row.move_60s_pct as number)
    : isFiniteNumber(row.move_15s_pct)
      ? (row.move_15s_pct as number)
      : null;
  return m === null ? Number.NEGATIVE_INFINITY : Math.abs(m);
}

/** Distance from HOD ascending (closer to HOD ranks higher); missing sorts last. */
function hodKey(v: number | null | undefined): number {
  return isFiniteNumber(v) ? Math.abs(v as number) : Number.POSITIVE_INFINITY;
}

function vwapKey(side: string | null | undefined): number {
  // Above VWAP ranks ahead of below/unknown.
  if (side === "above") return 0;
  if (side === "below") return 1;
  return 2;
}

function freshnessKey(cls: string | null | undefined): number {
  if (typeof cls === "string" && cls in FRESHNESS_ORDER) return FRESHNESS_ORDER[cls];
  return FRESHNESS_ORDER.unknown;
}

/**
 * Deterministic volume-first comparator. Signal hierarchy:
 *  1. session_volume (current volume / liquidity)   — desc
 *  2. volume_60s (volume velocity)                  — desc
 *  3. dollar_volume_60s (liquidity depth)           — desc
 *  4. acceleration_5m (volume acceleration)         — desc
 *  5. |short-window move| (price movement)          — desc
 *  6. distance_from_hod_pct (HOD behavior)          — asc (closer = higher)
 *  7. vwap_side (VWAP relationship: above > below)  — asc key
 *  8. freshness_class                               — asc key (fresh first)
 *  9. symbol                                        — asc (stable tie-break)
 *
 * A materially higher-volume active name can never be outranked by a
 * lower-volume name on a secondary score: the first non-zero comparison wins,
 * and session_volume is compared first.
 */
export function compareCandidatesVolumeFirst(
  a: RadarV2CandidateRow,
  b: RadarV2CandidateRow,
): number {
  let d = descKey(b.session_volume) - descKey(a.session_volume);
  if (d !== 0) return d;
  d = descKey(b.volume_60s) - descKey(a.volume_60s);
  if (d !== 0) return d;
  d = descKey(b.dollar_volume_60s) - descKey(a.dollar_volume_60s);
  if (d !== 0) return d;
  d = descKey(b.acceleration_5m) - descKey(a.acceleration_5m);
  if (d !== 0) return d;
  d = moveMagnitude(b) - moveMagnitude(a);
  if (d !== 0) return d;
  d = hodKey(a.distance_from_hod_pct) - hodKey(b.distance_from_hod_pct);
  if (d !== 0) return d;
  d = vwapKey(a.vwap_side) - vwapKey(b.vwap_side);
  if (d !== 0) return d;
  d = freshnessKey(a.freshness_class) - freshnessKey(b.freshness_class);
  if (d !== 0) return d;
  return a.symbol.localeCompare(b.symbol);
}

/**
 * Accepts up to the full promoted candidate set (128 default / 200 hard cap),
 * drops structurally invalid rows, and returns them in volume-first order.
 * Never truncates here — display caps are applied per tab downstream.
 */
export function rankRadarV2Candidates(
  candidates: readonly RadarV2CandidateRow[],
): RadarV2CandidateRow[] {
  return candidates
    .filter(isValidRadarV2Candidate)
    .slice()
    .sort(compareCandidatesVolumeFirst);
}

// ── Per-tab qualification (broad; discovery before narrowing) ────────────────

/**
 * Tab membership after the candidate universe has already reached the frontend.
 * Deliberately permissive so narrow filters do not re-create the zero-result
 * disconnect. Only qualifies on fields Radar V2 actually persists.
 */
export function qualifyCandidateForTab(
  row: RadarV2CandidateRow,
  tabId: string,
): boolean {
  switch (tabId) {
    case "day_trade_radar":
      // Full Radar PM candidate universe.
      return true;
    case "volume_spikes":
    case "unusual_volume":
      // Real persisted volume evidence (session volume already validated > = 0).
      return isFiniteNumber(row.session_volume) && (row.session_volume as number) > 0;
    case "gainers_losers":
      // Requires a valid available short-window price move (no prior-close fake).
      return isFiniteNumber(row.move_60s_pct) || isFiniteNumber(row.move_15s_pct);
    default:
      return false;
  }
}

// ── Mapping to the existing ScreenerResultRow view model ─────────────────────

export function mapCandidateToScreenerRow(
  row: RadarV2CandidateRow,
  tabId: string,
): RadarV2ScreenerRow {
  const symbol = normalizeSymbol(row.symbol) as string;
  return {
    tab_id: tabId,
    symbol,
    company_name: null, // Radar V2 does not persist company name.
    price: isFiniteNumber(row.last_price) ? row.last_price : null,
    // No confirmed prior-close % change pre-market. Radar's short-window move is
    // NOT a day/session change and must not be mislabeled → leave null (`—`).
    change_percent: null,
    volume: isFiniteNumber(row.session_volume) ? row.session_volume : null,
    avg_volume: null,
    rvol: null, // Not persisted; never fabricated → UI renders `—`.
    float_shares: null,
    gap_percent: null, // No prior close persisted → no honest gap.
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null, // No prior-session volume in Radar V2.
    volume_ratio_prior_session: null,
    day_high: isPositiveFinite(row.session_high) ? row.session_high : null,
    day_low: isPositiveFinite(row.session_low) ? row.session_low : null,
    provider_as_of: row.provider_as_of ?? row.updated_at,
    sync_run_id: row.generation_id,
    updated_at: row.updated_at,
    // Radar ranking metadata carried through to the Day Trade Radar board.
    // These are the authoritative persisted Radar V2 fields — not fabricated.
    signal_status: row.signal_status,
    signal_tier: row.lifecycle,
    rolling_volume_5s: isFiniteNumber(row.volume_5s) ? row.volume_5s : null,
    rolling_volume_15s: isFiniteNumber(row.volume_15s) ? row.volume_15s : null,
    rolling_volume_60s: isFiniteNumber(row.volume_60s) ? row.volume_60s : null,
    acceleration_5m: isFiniteNumber(row.acceleration_5m) ? row.acceleration_5m : null,
  };
}

// ── Decision: prefer Radar V2 (fresh, active session) or fall back ───────────

export function currentRadarV2Feed(
  feedRows: readonly RadarV2FeedStateRow[] | null,
): RadarV2FeedStateRow | null {
  if (!feedRows) return null;
  const current = feedRows.filter((r) => r.state_key === "current");
  return current.length === 1 ? current[0] : null;
}

/**
 * Handshake check: the second feed read still describes the generation captured
 * on the first read. Generation id, session, and v2_synced_at must all agree so
 * we never mix a feed from generation A with candidates from generation B.
 */
export function isSameAcceptedRadarV2Generation(
  first: RadarV2FeedStateRow,
  second: RadarV2FeedStateRow,
): boolean {
  if (!first.v2_generation_id || !second.v2_generation_id) return false;
  if (first.v2_generation_id !== second.v2_generation_id) return false;
  if ((first.session_kind ?? null) !== (second.session_kind ?? null)) return false;
  if (!first.v2_synced_at || !second.v2_synced_at) return false;
  return first.v2_synced_at === second.v2_synced_at;
}

function fallback(reason: string, session: string | null): RadarV2Decision {
  return { source: "fallback", reason, session, view: null };
}

/**
 * Central consumer decision. Returns `source: "radar-v2"` with a ready view when
 * Radar V2 is the preferred, fresh, single-generation source for the tab and the
 * active session; otherwise `source: "fallback"` so the caller uses the existing
 * verified screener_results path (an honest empty during pre-market).
 */
export function buildRadarV2Decision(input: {
  feedRows: readonly RadarV2FeedStateRow[] | null;
  candidateRows: readonly RadarV2CandidateRow[] | null;
  tabId: string;
  nowMs: number;
}): RadarV2Decision {
  const { feedRows, candidateRows, tabId, nowMs } = input;

  if (!isRadarV2BackedTab(tabId)) return fallback("tab_not_radar_backed", null);

  const feed = currentRadarV2Feed(feedRows);
  if (!feed) return fallback("no_current_feed_state", null);

  const session = feed.session_kind ?? null;
  if (!isRadarV2ActiveSession(session)) {
    return fallback(`session_not_active:${session ?? "null"}`, session);
  }

  const generationId = feed.v2_generation_id;
  if (!generationId) return fallback("no_v2_generation", session);

  const syncedMs = parseTimestampMs(feed.v2_synced_at);
  if (syncedMs === null) return fallback("no_v2_synced_at", session);

  // ── V2 health gate (V2-specific fields ONLY; not the legacy V1 flag) ──────
  //
  // `feed.feed_stale` is a LEGACY V1 health flag driven by the V1
  // `publish_generation` path. In production it can be `true` while the V2
  // pipeline is fully healthy (fresh `v2_synced_at`, advancing
  // `v2_generation_id`, fresh `last_receive_at`). It therefore MUST NOT gate
  // Radar V2 candidate health, and is intentionally NOT consulted here.
  //
  // V2 liveness is decided by V2-specific evidence:
  //   • v2_generation_id  — required (checked above)
  //   • v2_synced_at      — required + within the stale threshold (below)
  //   • last_receive_at   — ingest liveness, when the worker has recorded it
  // We deliberately do NOT use `last_provider_event_at`: the Massive tape is
  // intentionally ~15 min delayed, so provider-event age is not pipeline age.

  // Pipeline freshness: a genuinely stale V2 generation must not be shown live.
  if (nowMs - syncedMs > RADAR_V2_STALE_AFTER_MS) {
    return fallback("radar_v2_stale", session);
  }

  // Ingest liveness: if the worker recorded a `last_receive_at`, it must be
  // fresh. A MISSING value is allowed — `v2_synced_at` (checked above) already
  // proves the current V2 generation is fresh. A present-but-unparseable value
  // cannot prove liveness, so we fall back honestly rather than show it live.
  if (feed.last_receive_at !== null && feed.last_receive_at !== undefined) {
    const receiveMs = parseTimestampMs(feed.last_receive_at);
    if (receiveMs === null || nowMs - receiveMs > RADAR_V2_STALE_AFTER_MS) {
      return fallback("radar_v2_receive_stale", session);
    }
  }

  const candidates = candidateRows ?? [];

  // Generation fencing: only rows from the authoritative current generation.
  const genMatched = candidates.filter((c) => c.generation_id === generationId);
  const declaredCount = feed.candidate_count ?? 0;
  if (genMatched.length === 0 && declaredCount > 0) {
    // Feed advertises candidates but none of the current generation are visible
    // yet (checkpoint race / mixed read). Do not show a partial board.
    return fallback("generation_race", session);
  }

  // Session fencing: never relabel another session's rows as this session.
  const sessionMatched = genMatched.filter((c) => c.session_kind === session);

  const syncedAt = feed.v2_synced_at;
  const providerAsOfMax = feed.last_provider_event_at ?? null;

  // Rank the whole (session-fenced) universe volume-first, then qualify per tab.
  const ranked = rankRadarV2Candidates(sessionMatched);
  const qualified = ranked.filter((c) => qualifyCandidateForTab(c, tabId));

  if (qualified.length === 0) {
    // Honest empty from a healthy Radar generation (no fake rows).
    return {
      source: "radar-v2",
      reason: "radar_v2_empty",
      session,
      view: {
        status: "empty",
        rows: [],
        synced_at: syncedAt,
        provider_as_of_max: providerAsOfMax,
      },
    };
  }

  const limit = tabDisplayLimit(tabId);
  const rows = qualified
    .slice(0, limit)
    .map((c) => mapCandidateToScreenerRow(c, tabId));

  return {
    source: "radar-v2",
    reason: "radar_v2_available",
    session,
    view: {
      status: "available",
      rows,
      synced_at: syncedAt,
      provider_as_of_max: providerAsOfMax,
    },
  };
}
