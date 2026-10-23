/** Default consecutive qualifying failures before automatic ingestion pause. */
export const SEC_SYNC_DEFAULT_FAILURE_PAUSE_THRESHOLD = 3;

export type SecSyncControlState = {
  consecutive_failures: number;
  ingestion_paused: boolean;
  failure_pause_threshold: number;
};

export type SecSyncRunOutcome = {
  consecutive_failures: number;
  ingestion_paused: boolean;
  auto_pause_applied: boolean;
};

export function normalizeFailurePauseThreshold(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 20) {
    return value;
  }
  return SEC_SYNC_DEFAULT_FAILURE_PAUSE_THRESHOLD;
}

/**
 * Pure outcome logic mirrored by apply_sec_edgar_sync_run_outcome_v1 in Postgres.
 * Success resets consecutive_failures only; pause flag is never cleared here.
 */
export function applySecSyncRunOutcome(
  state: SecSyncControlState,
  success: boolean,
): SecSyncRunOutcome {
  const threshold = normalizeFailurePauseThreshold(state.failure_pause_threshold);
  if (success) {
    return {
      consecutive_failures: 0,
      ingestion_paused: state.ingestion_paused,
      auto_pause_applied: false,
    };
  }
  const next = state.consecutive_failures + 1;
  if (next >= threshold) {
    const wasPaused = state.ingestion_paused;
    return {
      consecutive_failures: next,
      ingestion_paused: true,
      auto_pause_applied: !wasPaused,
    };
  }
  return {
    consecutive_failures: next,
    ingestion_paused: state.ingestion_paused,
    auto_pause_applied: false,
  };
}
