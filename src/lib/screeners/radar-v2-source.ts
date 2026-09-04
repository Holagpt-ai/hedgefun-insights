/**
 * Radar V2 screener data-layer source (D5 / D11).
 *
 * Thin Supabase reader for `radar_v22_feed_state` (V2 columns) and
 * `radar_v22_candidates`, feeding the pure `buildRadarV2Decision` adapter.
 * Kept out of the visual table components and out of the pure adapter so the
 * mapping stays unit-testable without a database.
 *
 * V2 generations are replaced frequently. A parallel feed+candidate read can
 * observe generation A on the feed and generation B on the candidates, which
 * the adapter honestly reports as `generation_race` and which used to fall
 * back immediately to screener_results. D11 reads one coherent generation
 * with a bounded stable-generation handshake instead.
 *
 * The generated Supabase types do not yet include the Persistence V2 columns
 * (`v2_generation_id`, `v2_synced_at`, `candidate_count`, `session_kind`, …) or
 * the `radar_v22_candidates` table. We do NOT edit the schema or regenerate
 * types in this sprint; instead we read through an untyped client view and cast
 * to the narrow adapter row shapes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  buildRadarV2Decision,
  currentRadarV2Feed,
  isRadarV2BackedTab,
  isSameAcceptedRadarV2Generation,
  RADAR_V2_CANDIDATE_CAP,
  type RadarV2CandidateRow,
  type RadarV2Decision,
  type RadarV2FeedStateRow,
} from "@/lib/screeners/radar-v2-adapter";
import {
  recordRadarV2LoadDiagnostic,
  type RadarV2LoadDiagnostic,
} from "@/lib/screeners/radar-v2-diagnostics";

const FEED_SELECT =
  "state_key,session_kind,sentinel_enabled,candidate_count,v2_generation_id," +
  "v2_synced_at,last_receive_at,last_provider_event_at,feed_stale,updated_at";

const CANDIDATE_SELECT = [
  "symbol",
  "generation_id",
  "trading_date",
  "session_kind",
  "lifecycle",
  "signal_status",
  "last_price",
  "move_15s_pct",
  "move_60s_pct",
  "volume_5s",
  "volume_15s",
  "volume_60s",
  "session_volume",
  "dollar_volume_60s",
  "acceleration_5m",
  "session_high",
  "session_low",
  "distance_from_hod_pct",
  "session_vwap",
  "vwap_side",
  "freshness_class",
  "provider_as_of",
  "updated_at",
].join(",");

/** Bounded handshake attempts. Do not spin; three coherent-read tries is enough. */
export const RADAR_V2_STABLE_READ_ATTEMPTS = 3;

/** Small delay between handshake retries so a mid-write generation can settle. */
export const RADAR_V2_RETRY_DELAY_MS = 50;

/** Untyped view of the client for tables/columns not in the generated types. */
function untyped(): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

export interface RadarV2StoreReader {
  readCurrentFeed(): Promise<{ rows: RadarV2FeedStateRow[] | null; error: unknown }>;
  readCandidatesByGeneration(
    generationId: string,
  ): Promise<{ rows: RadarV2CandidateRow[] | null; error: unknown }>;
}

export interface LoadRadarV2Options {
  reader?: RadarV2StoreReader;
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RadarV2FetchResult {
  feedRows: RadarV2FeedStateRow[] | null;
  candidateRows: RadarV2CandidateRow[] | null;
  error: unknown;
  /** Why this handshake attempt was rejected, when it was. */
  handshakeReason: string | null;
}

async function defaultSleep(ms: number): Promise<void> {
  if (!(ms > 0)) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function createSupabaseReader(): RadarV2StoreReader {
  const db = untyped();
  return {
    async readCurrentFeed() {
      const res = await db
        .from("radar_v22_feed_state")
        .select(FEED_SELECT)
        .eq("state_key", "current");
      if (res.error) return { rows: null, error: res.error };
      return {
        rows: (res.data ?? null) as unknown as RadarV2FeedStateRow[] | null,
        error: null,
      };
    },
    async readCandidatesByGeneration(generationId: string) {
      const res = await db
        .from("radar_v22_candidates")
        .select(CANDIDATE_SELECT)
        .eq("generation_id", generationId)
        .limit(RADAR_V2_CANDIDATE_CAP);
      if (res.error) return { rows: null, error: res.error };
      return {
        rows: (res.data ?? null) as unknown as RadarV2CandidateRow[] | null,
        error: null,
      };
    },
  };
}

function fetchErrorResult(): RadarV2FetchResult {
  return { feedRows: null, candidateRows: null, error: true, handshakeReason: "radar_v2_fetch_error" };
}

/**
 * One stable-generation handshake:
 *   1. read current feed
 *   2. read candidates FILTERED by that v2_generation_id
 *   3. read current feed again
 *   4. accept only if generation id and session still match
 *      (`v2_synced_at` may advance on the same generation; it is freshness,
 *      not identity)
 *
 * Never issues a parallel feed-and-candidate read.
 */
export async function fetchRadarV2StableGeneration(
  reader: RadarV2StoreReader,
): Promise<RadarV2FetchResult> {
  const first = await reader.readCurrentFeed();
  if (first.error) return fetchErrorResult();

  const feed1 = currentRadarV2Feed(first.rows);
  if (!feed1) {
    return {
      feedRows: first.rows,
      candidateRows: [],
      error: null,
      handshakeReason: "no_current_feed_state",
    };
  }

  const generationId = feed1.v2_generation_id;
  if (!generationId) {
    return {
      feedRows: first.rows,
      candidateRows: [],
      error: null,
      handshakeReason: "no_v2_generation",
    };
  }

  const cand = await reader.readCandidatesByGeneration(generationId);
  if (cand.error) return fetchErrorResult();

  const second = await reader.readCurrentFeed();
  if (second.error) return fetchErrorResult();

  const feed2 = currentRadarV2Feed(second.rows);
  if (!feed2) {
    return {
      feedRows: second.rows,
      candidateRows: cand.rows,
      error: null,
      handshakeReason: "generation_race",
    };
  }

  if (!isSameAcceptedRadarV2Generation(feed1, feed2)) {
    return {
      feedRows: second.rows,
      candidateRows: cand.rows,
      error: null,
      handshakeReason: "generation_race",
    };
  }

  // Second feed is the confirmed row for the accepted generation.
  return {
    feedRows: second.rows,
    candidateRows: cand.rows,
    error: null,
    handshakeReason: null,
  };
}

function isRetryableHandshake(reason: string | null): boolean {
  return reason === "generation_race";
}

function isRetryableDecision(decision: RadarV2Decision): boolean {
  return decision.source === "fallback" && decision.reason === "generation_race";
}

function recordAndReturn(
  decision: RadarV2Decision,
  extra: Omit<RadarV2LoadDiagnostic, "reason" | "source" | "session">,
): RadarV2Decision {
  recordRadarV2LoadDiagnostic({
    reason: decision.reason,
    source: decision.source,
    session: decision.session,
    ...extra,
  });
  return decision;
}

/**
 * Fetch + decide. For tabs that are not Radar-backed, or on any read error, this
 * returns a `fallback` decision so the caller uses the existing verified path.
 *
 * Generation races retry up to `RADAR_V2_STABLE_READ_ATTEMPTS` times. Other
 * honest failures (stale, wrong session, missing generation) return immediately.
 */
export async function loadRadarV2Decision(
  tabId: string,
  nowMs: number,
  options: LoadRadarV2Options = {},
): Promise<RadarV2Decision> {
  if (!isRadarV2BackedTab(tabId)) {
    return recordAndReturn(
      { source: "fallback", reason: "tab_not_radar_backed", session: null, view: null },
      { attempts: 0, generationId: null, declaredCandidateCount: null, lastAttemptReason: null },
    );
  }

  const reader = options.reader ?? createSupabaseReader();
  const maxAttempts = options.maxAttempts ?? RADAR_V2_STABLE_READ_ATTEMPTS;
  const sleep = options.sleep ?? defaultSleep;

  let lastAttemptReason: string | null = null;
  let lastGenerationId: string | null = null;
  let lastDeclaredCount: number | null = null;
  let lastDecision: RadarV2Decision | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let fetched: RadarV2FetchResult;
    try {
      fetched = await fetchRadarV2StableGeneration(reader);
    } catch {
      const decision: RadarV2Decision = {
        source: "fallback",
        reason: "radar_v2_fetch_threw",
        session: null,
        view: null,
      };
      return recordAndReturn(decision, {
        attempts: attempt,
        generationId: lastGenerationId,
        declaredCandidateCount: lastDeclaredCount,
        lastAttemptReason: "radar_v2_fetch_threw",
      });
    }

    if (fetched.error) {
      const decision: RadarV2Decision = {
        source: "fallback",
        reason: "radar_v2_fetch_error",
        session: null,
        view: null,
      };
      return recordAndReturn(decision, {
        attempts: attempt,
        generationId: lastGenerationId,
        declaredCandidateCount: lastDeclaredCount,
        lastAttemptReason: "radar_v2_fetch_error",
      });
    }

    const feed = currentRadarV2Feed(fetched.feedRows);
    lastGenerationId = feed?.v2_generation_id ?? lastGenerationId;
    lastDeclaredCount = feed?.candidate_count ?? lastDeclaredCount;

    if (fetched.handshakeReason && fetched.handshakeReason !== "generation_race") {
      // Handshake found a non-race failure (no current feed / no generation).
      // Let the adapter emit the same honest reason from the captured rows.
      const decision = buildRadarV2Decision({
        feedRows: fetched.feedRows,
        candidateRows: fetched.candidateRows,
        tabId,
        nowMs,
      });
      return recordAndReturn(decision, {
        attempts: attempt,
        generationId: lastGenerationId,
        declaredCandidateCount: lastDeclaredCount,
        lastAttemptReason: fetched.handshakeReason,
      });
    }

    if (isRetryableHandshake(fetched.handshakeReason)) {
      lastAttemptReason = "generation_race";
      lastDecision = {
        source: "fallback",
        reason: "generation_race",
        session: feed?.session_kind ?? null,
        view: null,
      };
      if (attempt < maxAttempts) {
        await sleep(RADAR_V2_RETRY_DELAY_MS);
        continue;
      }
      break;
    }

    const decision = buildRadarV2Decision({
      feedRows: fetched.feedRows,
      candidateRows: fetched.candidateRows,
      tabId,
      nowMs,
    });
    lastDecision = decision;
    lastAttemptReason = decision.reason;

    if (isRetryableDecision(decision)) {
      if (attempt < maxAttempts) {
        await sleep(RADAR_V2_RETRY_DELAY_MS);
        continue;
      }
      break;
    }

    return recordAndReturn(decision, {
      attempts: attempt,
      generationId: lastGenerationId,
      declaredCandidateCount: lastDeclaredCount,
      lastAttemptReason: decision.reason,
    });
  }

  const exhausted: RadarV2Decision = {
    source: "fallback",
    reason: "radar_v2_retry_exhausted",
    session: lastDecision?.session ?? null,
    view: null,
  };
  return recordAndReturn(exhausted, {
    attempts: maxAttempts,
    generationId: lastGenerationId,
    declaredCandidateCount: lastDeclaredCount,
    lastAttemptReason,
  });
}
