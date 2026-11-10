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

import {
  assessFreshness,
  formatAge,
  providerDelayAllowanceMs,
  providerDelayFromFeedMode,
  SESSION_LABEL,
  type SessionContext,
} from "@/lib/ops/freshness";
import { safeDisplayText } from "@/lib/ops/redact";
import type { OpsStatus } from "@/lib/ops/status";
import { worstStatus } from "@/lib/ops/status";
import { easternParts } from "@/lib/market-session";
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
  v2PublicationStatus: OpsStatus;
  v2PublicationExplanation: string;
}

/** V2 publication lag must not be masked by V1 checkpoint / feed telemetry alone. */
export function assessV2PublicationFreshness(
  row: RadarFeedOpsRow,
  context: SessionContext,
): { status: OpsStatus; explanation: string; ageMs: number | null } {
  if (context.session === "closed") {
    return {
      status: "not_applicable",
      explanation: "Session closed; V2 publication cadence not required.",
      ageMs: null,
    };
  }
  const v2Ms = parseTimestampMs(row.v2_synced_at);
  const ageMs = v2Ms === null ? null : context.nowMs - v2Ms;
  const delay = providerDelayFromFeedMode(row.market_data_feed_mode);
  const allowance = providerDelayAllowanceMs(delay);

  if (v2Ms === null) {
    return {
      status: "failing",
      explanation: "V2 publication timestamp (v2_synced_at) is missing during a live session.",
      ageMs: null,
    };
  }

  const freshness = assessFreshness({
    context,
    observedAtIso: row.v2_synced_at,
    staleAfterMs: WORKER_CHECKPOINT_STALE_MS + allowance,
    providerDelayMs: 0,
    failingMultiplier: 2,
  });

  const parts = easternParts(context.nowMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  const etSurveillanceDate = parts
    ? (parts.msOfDay >= 4 * 60 * 60 * 1000
      ? `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
      : (() => {
        const prev = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - 86400000);
        return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
      })())
    : null;

  if (row.session_kind && row.session_kind !== context.session) {
    return {
      status: "degraded",
      ageMs,
      explanation: `V2 feed session_kind is "${row.session_kind}" but the current market session is "${context.session}" (${SESSION_LABEL[context.session]}).`,
    };
  }

  if (etSurveillanceDate && row.session_date && row.session_date < etSurveillanceDate) {
    return {
      status: "degraded",
      ageMs,
      explanation: `V2 session_date ${row.session_date} is behind current surveillance date ${etSurveillanceDate}.`,
    };
  }

  if (freshness.status !== "healthy") {
    return {
      status: freshness.status,
      ageMs: freshness.ageMs,
      explanation: `V2 publication ${formatAge(freshness.ageMs)} old (${freshness.explanation}).`,
    };
  }

  return {
    status: "healthy",
    ageMs,
    explanation: `V2 publication ${formatAge(ageMs)} old; aligned with ${SESSION_LABEL[context.session]}.`,
  };
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
  const v2Pub = assessV2PublicationFreshness(row, context);

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
    v2PublicationStatus: v2Pub.status,
    v2PublicationExplanation: v2Pub.explanation,
  };

  const mergeStatus = (
    status: OpsStatus,
    explanation: string,
  ): { status: OpsStatus; explanation: string } => {
    const combined = worstStatus([status, v2Pub.status]);
    if (combined === status) return { status, explanation };
    const v2Note = v2Pub.status !== "healthy" && v2Pub.status !== "not_applicable"
      ? ` ${v2Pub.explanation}`
      : "";
    return { status: combined, explanation: `${explanation}${v2Note}` };
  };

  if (checkpointAgeMs === null) {
    const m = mergeStatus("unknown", "Worker checkpoint timestamp missing.");
    return { ...base, status: m.status, explanation: m.explanation };
  }

  // A stale checkpoint is never a current heartbeat, whatever the session.
  if (context.session !== "closed" && checkpointAgeMs > WORKER_CHECKPOINT_STALE_MS) {
    const m = mergeStatus(
      "stale_telemetry",
      `Last worker checkpoint ${formatAge(checkpointAgeMs)} ago — no current heartbeat evidence.`,
    );
    return { ...base, status: m.status, explanation: m.explanation };
  }
  if (context.session === "closed") {
    return {
      ...base,
      status: "not_applicable",
      explanation: `Session closed; last worker checkpoint ${formatAge(checkpointAgeMs)} ago.`,
    };
  }
  if (row.feed_telemetry_stale) {
    const m = mergeStatus("stale_telemetry", "Worker reports its feed telemetry as stale.");
    return { ...base, status: m.status, explanation: m.explanation };
  }
  if (conn === "disconnected" || conn === "idle") {
    const m = mergeStatus("failing", `Provider feed connection is ${conn} during a live session.`);
    return { ...base, status: m.status, explanation: m.explanation };
  }
  if (conn === "connecting" || conn === "authenticating" || conn === "reconnecting") {
    const m = mergeStatus("degraded", `Provider feed connection is ${conn}.`);
    return { ...base, status: m.status, explanation: m.explanation };
  }
  if (row.feed_stale) {
    const m = mergeStatus("degraded", "Worker reports feed data as stale.");
    return { ...base, status: m.status, explanation: m.explanation };
  }
  if (conn === null) {
    const m = mergeStatus(
      "unknown",
      `Checkpoint ${formatAge(checkpointAgeMs)} ago, but no feed connection state reported.`,
    );
    return { ...base, status: m.status, explanation: m.explanation };
  }
  const m = mergeStatus(
    "healthy",
    `Checkpoint ${formatAge(checkpointAgeMs)} ago; feed ${conn}${row.market_data_feed_mode === "delayed" ? " (delayed tier — expected)" : ""}.`,
  );
  return { ...base, status: m.status, explanation: m.explanation };
}
