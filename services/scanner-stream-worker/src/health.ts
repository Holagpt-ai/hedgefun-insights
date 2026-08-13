export type WorkerStatus = "running" | "degraded" | "initializing";
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
};

export function createHealthStore(startedAtMs: number): HealthStore {
  let workerStatus: WorkerStatus = "initializing";
  let baselineStatus: BaselineStatus = "initializing";
  let currentGenerationId: string | null = null;
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let symbolCount = 0;
  let lastErrorCode: string | null = null;

  return {
    get(nowMs: number): HealthPayload {
      return {
        status: workerStatus,
        baseline_status: baselineStatus,
        current_generation_id: currentGenerationId,
        period_start: periodStart,
        period_end: periodEnd,
        symbol_count: symbolCount,
        last_error_code: sanitizeErrorCode(lastErrorCode),
        uptime_ms: Math.max(0, nowMs - startedAtMs),
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
      workerStatus = input.workerStatus ??
        (baselineStatus === "available" || baselineStatus === "empty"
          ? "running"
          : "initializing");
    },
    markError(code: string, hasGeneration: boolean) {
      lastErrorCode = sanitizeErrorCode(code);
      workerStatus = "degraded";
      if (!hasGeneration) {
        baselineStatus = "unavailable";
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
