/**
 * Fly worker (`stocksist-radar-v22-worker`) observation from
 * `radar_v22_feed_state` — the row the worker persists on every checkpoint
 * (default 30 s, max 300 s; services/scanner-stream-worker/src/env.ts).
 *
 * The row's `updated_at` is the closest trustworthy heartbeat available to
 * an admin browser session. The lease table `radar_v22_lease` (true
 * heartbeat) is service-role only. Worker version is not persisted anywhere
 * readable, so it is always UNKNOWN here.
 */

import { assessFreshness, formatAge, providerDelayAllowanceMs, providerDelayFromFeedMode, type SessionContext } from "@/lib/ops/freshness";
import { safeDisplayText } from "@/lib/ops/redact";
import type { OpsStatus } from "@/lib/ops/status";
import { parseTimestampMs } from "@/lib/screeners/contract";

/** Max checkpoint interval (300 s) plus slack. */
export const WORKER_CHECKPOINT_STALE_MS = 6 * 60_000;

export const RADAR_FEED_OPS_SELECT =
  "state_key,status,session_kind,session_date,updated_at,synced_at,v2_synced_at,last_receive_at," +
  "last_provider_event_at,feed_stale,feed_telemetry_stale,feed_connection_state,feed_last_message_at," +
  "feed_latency_ms,market_data_provider,market_data_feed_mode,candidate_count";

export interface RadarFeedOpsRow {
  state_key: string;
  status: string;
  session_kind: string | null;
  session_date: string | null;
  updated_at: string;
  synced_at: string;
  v2_synced_at: string | null;
  last_receive_at: string | null;
  last_provider_event_at: string | null;
  feed_stale: boolean;
  feed_telemetry_stale: boolean;
  feed_connection_state: string | null;
  feed_last_message_at: string | null;
  feed_latency_ms: number | null;
  market_data_provider: string | null;
  market_data_feed_mode: string | null;
  candidate_count: number;
}

export interface WorkerOpsView {
  status: OpsStatus;
  explanation: string;
  checkpointAt: string;
  checkpointAgeMs: number | null;
  connectionState: string | null;
  feedMode: string | null;
  provider: string | null;
  lastProviderEventAt: string | null;
  lastMessageAt: string | null;
  latencyMs: number | null;
  sessionKind: string | null;
  feedStale: boolean;
  telemetryStale: boolean;
  providerStatus: OpsStatus;
  providerExplanation: string;
}

export function buildWorkerOpsView(row: RadarFeedOpsRow, context: SessionContext): WorkerOpsView {
  const checkpointMs = parseTimestampMs(row.updated_at);
  const checkpointAgeMs = checkpointMs === null ? null : context.nowMs - checkpointMs;
  const conn = row.feed_connection_state ? safeDisplayText(row.feed_connection_state, 32) : null;
  const delay = providerDelayFromFeedMode(row.market_data_feed_mode);
  const provider = assessFreshness({
    context,
    observedAtIso: row.last_provider_event_at,
    staleAfterMs: WORKER_CHECKPOINT_STALE_MS,
    providerDelayMs: providerDelayAllowanceMs(delay),
  });
  const providerExplanation =
    delay === "unknown" && provider.status === "healthy"
      ? `${provider.explanation} Feed mode not reported; delayed allowance applied.`
      : provider.explanation;

  const base = {
    checkpointAt: row.updated_at,
    checkpointAgeMs,
    connectionState: conn,
    feedMode: row.market_data_feed_mode,
    provider: row.market_data_provider,
    lastProviderEventAt: row.last_provider_event_at,
    lastMessageAt: row.feed_last_message_at,
    latencyMs: row.feed_latency_ms,
    sessionKind: row.session_kind,
    feedStale: row.feed_stale,
    telemetryStale: row.feed_telemetry_stale,
    providerStatus: provider.status,
    providerExplanation,
  };

  if (checkpointAgeMs === null) {
    return { ...base, status: "unknown", explanation: "Worker checkpoint timestamp missing." };
  }

  // A stale checkpoint is never a current heartbeat, whatever the session.
  if (context.session !== "closed" && checkpointAgeMs > WORKER_CHECKPOINT_STALE_MS) {
    return {
      ...base,
      status: "stale_telemetry",
      explanation: `Last worker checkpoint ${formatAge(checkpointAgeMs)} ago — no current heartbeat evidence.`,
    };
  }
  if (context.session === "closed") {
    return {
      ...base,
      status: "not_applicable",
      explanation: `Session closed; last worker checkpoint ${formatAge(checkpointAgeMs)} ago.`,
    };
  }
  if (row.feed_telemetry_stale) {
    return { ...base, status: "stale_telemetry", explanation: "Worker reports its feed telemetry as stale." };
  }
  if (conn === "disconnected" || conn === "idle") {
    return { ...base, status: "failing", explanation: `Provider feed connection is ${conn} during a live session.` };
  }
  if (conn === "connecting" || conn === "authenticating" || conn === "reconnecting") {
    return { ...base, status: "degraded", explanation: `Provider feed connection is ${conn}.` };
  }
  if (row.feed_stale) {
    return { ...base, status: "degraded", explanation: "Worker reports feed data as stale." };
  }
  if (conn === null) {
    return {
      ...base,
      status: "unknown",
      explanation: `Checkpoint ${formatAge(checkpointAgeMs)} ago, but no feed connection state reported.`,
    };
  }
  return {
    ...base,
    status: "healthy",
    explanation: `Checkpoint ${formatAge(checkpointAgeMs)} ago; feed ${conn}${row.market_data_feed_mode === "delayed" ? " (delayed tier — expected)" : ""}.`,
  };
}
