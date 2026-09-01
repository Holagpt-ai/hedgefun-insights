import type { RadarHealthSnapshot } from "./radar/types.ts";

export type WorkerStatus = "running" | "degraded" | "initializing" | "stale";
export type BaselineStatus =
  | "initializing"
  | "available"
  | "empty"
  | "unavailable";

export type HealthPayload = {
  status: WorkerStatus;
  baseline_status: BaselineStatus;
  current_generation_id: string | null;
  period_start: string | null;
  period_end: string | null;
  symbol_count: number;
  last_error_code: string | null;
  uptime_ms: number;
  radar: RadarHealthSnapshot;
};

const ALLOWED_ERROR_CODES = new Set([
  "missing_env",
  "invalid_env",
  "provider_unavailable",
  "provider_response_invalid",
  "persist_failed",
  "validation_failed",
  "eastern_clock_unavailable",
  "period_unresolved",
  "bootstrap_failed",
  "refresh_failed",
  "calendar_unavailable",
  "internal_error",
]);

export function sanitizeErrorCode(
  code: string | null | undefined,
): string | null {
  if (code == null || code === "") return null;
  if (ALLOWED_ERROR_CODES.has(code)) return code;
  return "internal_error";
}

const EMPTY_RADAR: RadarHealthSnapshot = {
  status: "degraded",
  connection_state: "idle",
  last_provider_event_at: null,
  last_published_generation: null,
  active_symbol_count: 0,
  correction_count: 0,
  duplicate_count: 0,
  out_of_order_count: 0,
  reconnect_count: 0,
  lease_held: false,
  sentinel_enabled: false,
  sentinel_live: 0,
  promoted_count: 0,
  promotion_cap: 128,
  sentinel_evictions: 0,
  promotions_total: 0,
  demotions_total: 0,
  cap_rejections: 0,
  rss_bytes: null,
};

export type HealthStore = {
  get(nowMs: number): HealthPayload;
  markInitializing(): void;
  applyState(input: {
    baselineStatus: BaselineStatus;
    generationId: string | null;
    periodStart: string | null;
    periodEnd: string | null;
    symbolCount: number;
    errorCode?: string | null;
    workerStatus?: WorkerStatus;
  }): void;
  markError(code: string, hasGeneration: boolean): void;
  applyRadar(snapshot: RadarHealthSnapshot): void;
};

export function createHealthStore(startedAtMs: number): HealthStore {
  let workerStatus: WorkerStatus = "initializing";
  let baselineStatus: BaselineStatus = "initializing";
  let currentGenerationId: string | null = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let symbolCount = 0;
  let lastErrorCode: string | null = null;
  let radar: RadarHealthSnapshot = { ...EMPTY_RADAR };

  function resolveWorkerStatus(explicit?: WorkerStatus): WorkerStatus {
    if (explicit) {
      if (explicit === "degraded" || radar.status === "degraded") {
        return "degraded";
      }
      return explicit;
    }
    if (radar.status === "degraded" && workerStatus !== "initializing") {
      return "degraded";
    }
    return workerStatus;
  }

  return {
    get(nowMs: number): HealthPayload {
      const status: WorkerStatus = workerStatus === "initializing"
        ? "initializing"
        : radar.status === "stale"
        ? "stale"
        : radar.status === "degraded"
        ? "degraded"
        : workerStatus;
      return {
        status,
        baseline_status: baselineStatus,
        current_generation_id: currentGenerationId,
        period_start: periodStart,
        period_end: periodEnd,
        symbol_count: symbolCount,
        last_error_code: sanitizeErrorCode(lastErrorCode),
        uptime_ms: Math.max(0, nowMs - startedAtMs),
        radar,
      };
    },
    markInitializing() {
      workerStatus = "initializing";
      baselineStatus = currentGenerationId ? baselineStatus : "initializing";
    },
    applyState(input) {
      baselineStatus = input.baselineStatus;
      currentGenerationId = input.generationId;
      periodStart = input.periodStart;
      periodEnd = input.periodEnd;
      symbolCount = input.symbolCount;
      if (input.errorCode === undefined) {
        lastErrorCode = null;
      } else {
        lastErrorCode = sanitizeErrorCode(input.errorCode);
      }
      workerStatus = resolveWorkerStatus(
        input.workerStatus ??
          (baselineStatus === "available" || baselineStatus === "empty"
            ? "running"
            : "initializing"),
      );
    },
    markError(code: string, hasGeneration: boolean) {
      lastErrorCode = sanitizeErrorCode(code);
      workerStatus = "degraded";
      if (!hasGeneration) {
        baselineStatus = "unavailable";
      }
    },
    applyRadar(snapshot) {
      radar = { ...snapshot };
      if (snapshot.status === "degraded" && workerStatus === "running") {
        workerStatus = "degraded";
      }
    },
  };
}

export function healthResponse(payload: HealthPayload): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
