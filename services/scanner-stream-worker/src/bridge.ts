import type { CalendarExceptionRow } from "../../../supabase/functions/_shared/markets/session-schedule.ts";
import type {
  CalendarExceptionLoader,
  LoadStateFn,
  RpcFn,
} from "./baseline/persist.ts";
import {
  emptyState,
  parseExceptionRow,
  parseStateRow,
} from "./baseline/persist.ts";
import type { FetchLike } from "./baseline/grouped.ts";
import { isRetryableStatus, RetryableError, withRetry } from "./retry.ts";
import type { LeaseClient } from "./radar/lease.ts";
import type { RadarRpcFn, ReplaceRadarArgs, SetStatusFn } from "./radar/persist.ts";
import type { RadarV2RpcFn } from "./radar/persist_v2.ts";
import { log } from "./log.ts";

export const DEFAULT_BRIDGE_TIMEOUT_MS = 15_000;
export const BASELINE_BRIDGE_TIMEOUT_MS = 60_000;

export type BridgeAttemptOutcome =
  | "ok"
  | "http_error"
  | "timeout"
  | "transport_error";

function payloadBytes(body: string): number {
  return new TextEncoder().encode(body).length;
}

function logBridgeAttempt(fields: {
  request_id: string;
  action: string;
  attempt: number;
  elapsed_ms: number;
  outcome: BridgeAttemptOutcome;
  http_status: number | null;
  timeout_ms: number;
  payload_bytes: number;
}): void {
  log(
    fields.outcome === "ok" ? "info" : "error",
    "bridge_request",
    fields,
  );
}

export type RadarBridge = {
  lease: LeaseClient;
  radarRpc: RadarRpcFn;
  radarV2Rpc: RadarV2RpcFn;
  setStatus: SetStatusFn;
  loadExceptions: CalendarExceptionLoader;
  baselineRpc: RpcFn;
  loadState: LoadStateFn;
};

type BridgeBody = Record<string, unknown>;


async function bridgePost(
  opts: {
    bridgeUrl: string;
    workerSecret: string;
    fetch: FetchLike;
    action: string;
    body: BridgeBody;
    timeoutMs: number;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<{ ok: false; status: number } | { ok: true; body: unknown }> {
  const requestId = crypto.randomUUID();
  const payload = JSON.stringify({
    action: opts.action,
    ...opts.body,
    request_id: requestId,
  });
  const bytes = payloadBytes(payload);
  const headers = {
    Authorization: `Bearer ${opts.workerSecret}`,
    "Content-Type": "application/json",
  };
  let attempt = 0;

  const run = async () => {
    attempt += 1;
    const started = Date.now();
    const finish = (
      outcome: BridgeAttemptOutcome,
      httpStatus: number | null,
    ) => {
      logBridgeAttempt({
        request_id: requestId,
        action: opts.action,
        attempt,
        elapsed_ms: Date.now() - started,
        outcome,
        http_status: httpStatus,
        timeout_ms: opts.timeoutMs,
        payload_bytes: bytes,
      });
    };

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
      const res = await opts.fetch(opts.bridgeUrl, {
        method: "POST",
        headers,
        body: payload,
        signal: ctrl.signal,
      });
      if (res.status === 401) {
        finish("http_error", 401);
        log("error", "bridge_auth_failed", {
          code: "unauthorized",
          request_id: requestId,
          action: opts.action,
        });
        return { ok: false as const, status: 401 };
      }
      if (isRetryableStatus(res.status)) {
        finish("http_error", res.status);
        throw new RetryableError(res.status);
      }
      if (!res.ok) {
        finish("http_error", res.status);
        return { ok: false as const, status: res.status };
      }
      let parsed: unknown = null;
      const text = await res.text();
      if (text.trim() !== "") {
        try {
          parsed = JSON.parse(text);
        } catch {
          finish("http_error", res.status);
          return { ok: false as const, status: 502 };
        }
      }
      finish("ok", res.status);
      return { ok: true as const, body: parsed };
    } catch (error) {
      if (error instanceof RetryableError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        finish("timeout", null);
        throw new RetryableError(504, "bridge_timeout");
      }
      finish("transport_error", null);
      throw new RetryableError(503, "bridge_unavailable");
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return await withRetry(run, {
      maxAttempts: 3,
      baseDelayMs: 250,
      maxDelayMs: 2_000,
      sleep: opts.sleep,
    });
  } catch (error) {
    const status = error instanceof RetryableError ? error.status : 503;
    log("error", "bridge_unavailable", {
      code: "persist_failed",
      status,
      request_id: requestId,
      action: opts.action,
    });
    return { ok: false, status };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resultTrue(body: unknown): boolean {
  if (!isRecord(body) || body.ok !== true) return false;
  return body.result === true;
}

export function createRadarBridge(opts: {
  bridgeUrl: string;
  workerSecret: string;
  fetch: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
}): RadarBridge {
  const defaultTimeout = opts.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS;
  const post = (
    action: string,
    body: BridgeBody,
    timeoutMs = defaultTimeout,
  ) =>
    bridgePost({
      bridgeUrl: opts.bridgeUrl,
      workerSecret: opts.workerSecret,
      fetch: opts.fetch,
      action,
      body,
      timeoutMs,
      sleep: opts.sleep,
    });

  const lease: LeaseClient = {
    async tryAcquire(holderId, ttlMs) {
      const res = await post("acquire_lease", {
        holder_id: holderId,
        ttl_ms: ttlMs,
      });
      if (!res.ok) return false;
      return resultTrue(res.body);
    },
    async heartbeat(holderId, ttlMs) {
      const res = await post("heartbeat_lease", {
        holder_id: holderId,
        ttl_ms: ttlMs,
      });
      if (!res.ok) return false;
      return resultTrue(res.body);
    },
    async release(holderId) {
      try {
        await post("release_lease", { holder_id: holderId });
      } catch {
        // best-effort release
      }
    },
  };

  const radarRpc: RadarRpcFn = async (args: ReplaceRadarArgs) => {
    const res = await post("publish_generation", { ...args });
    if (!res.ok) return { error: { message: "persist_failed" } };
    if (!isRecord(res.body) || res.body.ok !== true) {
      return { error: { message: "persist_failed" } };
    }
    return { error: null };
  };

  const radarV2Rpc: RadarV2RpcFn = async (args) => {
    const res = await post("publish_candidates_v2", { ...args });
    if (!res.ok) return { error: { message: "persist_failed" } };
    if (!isRecord(res.body) || res.body.ok !== true) {
      return { error: { message: "persist_failed" } };
    }
    return { error: null };
  };

  const setStatus: SetStatusFn = async (args) => {
    const res = await post("set_feed_status", { ...args });
    if (!res.ok) return { error: { message: "persist_failed" } };
    if (!isRecord(res.body) || res.body.ok !== true) {
      return { error: { message: "persist_failed" } };
    }
    return { error: null };
  };

  const loadExceptions: CalendarExceptionLoader = async () => {
    const res = await post("get_calendar", {});
    if (!res.ok) return null;
    if (!isRecord(res.body) || res.body.ok !== true) return null;
    const rows = res.body.rows;
    if (!Array.isArray(rows)) return null;
    const parsed: CalendarExceptionRow[] = [];
    for (const item of rows) {
      const row = parseExceptionRow(item);
      if (row) parsed.push(row);
    }
    return parsed;
  };

  const baselineRpc: RpcFn = async (args) => {
    const res = await post(
      "replace_52w_baseline",
      { ...args },
      BASELINE_BRIDGE_TIMEOUT_MS,
    );
    if (!res.ok) return { error: { message: "persist_failed" } };
    if (!isRecord(res.body) || res.body.ok !== true) {
      return { error: { message: "persist_failed" } };
    }
    return { error: null };
  };

  const loadState: LoadStateFn = async () => {
    const res = await post("get_52w_state", {});
    if (!res.ok) return null;
    if (!isRecord(res.body) || res.body.ok !== true) return null;
    if (res.body.state == null) return emptyState();
    return parseStateRow(res.body.state);
  };

  return {
    lease,
    radarRpc,
    radarV2Rpc,
    setStatus,
    loadExceptions,
    baselineRpc,
    loadState,
  };
}
