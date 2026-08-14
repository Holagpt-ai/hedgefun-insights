import {
  isRadarV22BoardLifecycle,
  isRadarV22FeedStatus,
  isRadarV22SignalStatus,
  RADAR_V22_BOARD_CAP,
  RADAR_V22_STATE_KEY,
  type RadarV22ArchiveRow,
  type RadarV22BoardRow,
  type RadarV22FeedState,
} from "../../../../supabase/functions/_shared/radar-v22/types.ts";
import type { FetchLike } from "../baseline/grouped.ts";

export const REPLACE_RADAR_RPC = "replace_radar_v22_generation_v1";
export const SET_RADAR_STATUS_RPC = "set_radar_v22_feed_status_v1";
export const STATE_TABLE = "radar_v22_feed_state";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]*$/;

export type ReplaceRadarArgs = {
  p_generation_id: string;
  p_rows: RadarV22BoardRow[];
  p_archive: RadarV22ArchiveRow[];
  p_session_date: string;
  p_synced_at: string;
  p_status: "available" | "empty" | "stale";
  p_last_provider_event_at: string | null;
};

export type RadarRpcFn = (
  args: ReplaceRadarArgs,
) => Promise<{ error: { message: string } | null }>;

export type SetStatusFn = (args: {
  p_status: "available" | "empty" | "stale";
  p_last_provider_event_at: string | null;
  p_synced_at: string;
}) => Promise<{ error: { message: string } | null }>;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  return Number.isFinite(Date.parse(value));
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function validateRadarGeneration(
  rows: RadarV22BoardRow[],
  generationId: string,
  sessionDate: string,
  syncedAt: string,
  status: "available" | "empty" | "stale",
): boolean {
  if (!isUuid(generationId)) return false;
  if (!isIsoDate(sessionDate) || !isIsoTimestamp(syncedAt)) return false;
  if (!isRadarV22FeedStatus(status)) return false;
  if (!Array.isArray(rows)) return false;
  if (rows.length > RADAR_V22_BOARD_CAP) return false;
  if (status === "empty" && rows.length !== 0) return false;
  if (status === "available" && rows.length === 0) return false;

  const seen = new Set<string>();
  const ranks: number[] = [];
  for (const row of rows) {
    if (row === null || typeof row !== "object") return false;
    if (row.generation_id !== generationId) return false;
    if (!SYMBOL_RE.test(row.symbol) || row.symbol.length > 12) return false;
    if (seen.has(row.symbol)) return false;
    seen.add(row.symbol);
    if (
      !Number.isInteger(row.rank) || row.rank < 1 ||
      row.rank > RADAR_V22_BOARD_CAP
    ) {
      return false;
    }
    ranks.push(row.rank);
    if (!isRadarV22BoardLifecycle(row.lifecycle)) return false;
    if (!isRadarV22SignalStatus(row.signal_status)) return false;
    if (!finitePositive(row.price) || !finitePositive(row.volume)) return false;
    if (!finitePositive(row.prior_session_volume)) return false;
    if (!finitePositive(row.volume_ratio_prior_session)) return false;
    if (!finitePositive(row.day_high) || !finitePositive(row.day_low)) {
      return false;
    }
    if (row.day_low > row.day_high) return false;
    if (!finiteNonNegative(row.rolling_volume_5s)) return false;
    if (!finiteNonNegative(row.rolling_volume_15s)) return false;
    if (!finiteNonNegative(row.rolling_volume_60s)) return false;
    if (!finiteNonNegative(row.rolling_dollar_volume_60s)) return false;
    if (
      row.acceleration_5m !== null &&
      (typeof row.acceleration_5m !== "number" ||
        !Number.isFinite(row.acceleration_5m))
    ) {
      return false;
    }
    if (
      !isIsoTimestamp(row.provider_as_of) || !isIsoTimestamp(row.updated_at)
    ) {
      return false;
    }
    if (!Number.isFinite(row.change_percent)) return false;
  }
  ranks.sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return false;
  }
  return true;
}

export type PublishRadarResult =
  | { ok: true }
  | { ok: false; code: "validation_failed" | "persist_failed" };

export async function publishRadarGeneration(
  rpc: RadarRpcFn,
  input: ReplaceRadarArgs,
): Promise<PublishRadarResult> {
  if (
    !validateRadarGeneration(
      input.p_rows,
      input.p_generation_id,
      input.p_session_date,
      input.p_synced_at,
      input.p_status,
    )
  ) {
    return { ok: false, code: "validation_failed" };
  }
  try {
    const result = await rpc(input);
    if (result.error) return { ok: false, code: "persist_failed" };
  } catch {
    return { ok: false, code: "persist_failed" };
  }
  return { ok: true };
}

export function parseRadarStateRow(raw: unknown): RadarV22FeedState | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  if (row.state_key !== RADAR_V22_STATE_KEY) return null;
  const generationId = row.generation_id;
  if (generationId !== null && !isUuid(generationId)) return null;
  if (!isRadarV22FeedStatus(row.status)) return null;
  const sessionDate = row.session_date;
  if (sessionDate !== null && !isIsoDate(sessionDate)) return null;
  if (!isIsoTimestamp(row.synced_at) || !isIsoTimestamp(row.updated_at)) {
    return null;
  }
  const count = Number(row.symbol_count ?? 0);
  if (!Number.isFinite(count) || count < 0) return null;
  return {
    state_key: RADAR_V22_STATE_KEY,
    generation_id: generationId === null ? null : generationId,
    status: row.status,
    session_date: sessionDate === null ? null : sessionDate,
    synced_at: row.synced_at,
    provider_as_of_min: typeof row.provider_as_of_min === "string"
      ? row.provider_as_of_min
      : null,
    provider_as_of_max: typeof row.provider_as_of_max === "string"
      ? row.provider_as_of_max
      : null,
    last_provider_event_at: typeof row.last_provider_event_at === "string"
      ? row.last_provider_event_at
      : null,
    symbol_count: Math.trunc(count),
    feed_stale: row.feed_stale === true,
    updated_at: row.updated_at,
  };
}

export function createRadarRpc(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetch: FetchLike;
}): RadarRpcFn {
  return async (args) => {
    const res = await opts.fetch(
      `${opts.supabaseUrl}/rest/v1/rpc/${REPLACE_RADAR_RPC}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.serviceRoleKey}`,
          apikey: opts.serviceRoleKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(args),
      },
    );
    if (!res.ok) return { error: { message: "persist_failed" } };
    return { error: null };
  };
}

export function createSetRadarStatus(opts: {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetch: FetchLike;
}): SetStatusFn {
  return async (args) => {
    const res = await opts.fetch(
      `${opts.supabaseUrl}/rest/v1/rpc/${SET_RADAR_STATUS_RPC}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opts.serviceRoleKey}`,
          apikey: opts.serviceRoleKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(args),
      },
    );
    if (!res.ok) return { error: { message: "persist_failed" } };
    return { error: null };
  };
}
