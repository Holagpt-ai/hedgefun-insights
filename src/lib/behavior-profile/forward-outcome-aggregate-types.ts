/** JSON shape from forward_outcome_aggregate_for_security_v1 (extended for profile v2). */
export interface ForwardOutcomeSecurityAggregate {
  security_id?: string;
  episode_count_d1: number | null;
  episode_count_d2?: number | null;
  episode_count_d3?: number | null;
  episode_count_d5: number | null;
  median_return_d1: number | null;
  median_return_d5: number | null;
  positive_return_d1_count: number | null;
  negative_return_d1_count: number | null;
  zero_return_d1_count: number | null;
  positive_return_d5_count: number | null;
  negative_return_d5_count: number | null;
  zero_return_d5_count: number | null;
  median_max_gain_d1: number | null;
  median_max_drawdown_d1: number | null;
  median_max_gain_d5: number | null;
  median_max_drawdown_d5: number | null;
  observed_next_session_positive_sample_size: number | null;
  observed_next_session_positive_continuation_count: number | null;
  observed_next_session_negative_sample_size: number | null;
  observed_next_session_negative_continuation_count: number | null;
}

export function parseForwardOutcomeSecurityAggregate(
  value: unknown,
): ForwardOutcomeSecurityAggregate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const readInt = (key: string): number | null => {
    const raw = row[key];
    if (raw === null || raw === undefined) return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };
  const readNum = (key: string): number | null => {
    const raw = row[key];
    if (raw === null || raw === undefined) return null;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return {
    security_id: typeof row.security_id === "string" ? row.security_id : undefined,
    episode_count_d1: readInt("episode_count_d1"),
    episode_count_d2: readInt("episode_count_d2"),
    episode_count_d3: readInt("episode_count_d3"),
    episode_count_d5: readInt("episode_count_d5"),
    median_return_d1: readNum("median_return_d1"),
    median_return_d5: readNum("median_return_d5"),
    positive_return_d1_count: readInt("positive_return_d1_count"),
    negative_return_d1_count: readInt("negative_return_d1_count"),
    zero_return_d1_count: readInt("zero_return_d1_count"),
    positive_return_d5_count: readInt("positive_return_d5_count"),
    negative_return_d5_count: readInt("negative_return_d5_count"),
    zero_return_d5_count: readInt("zero_return_d5_count"),
    median_max_gain_d1: readNum("median_max_gain_d1"),
    median_max_drawdown_d1: readNum("median_max_drawdown_d1"),
    median_max_gain_d5: readNum("median_max_gain_d5"),
    median_max_drawdown_d5: readNum("median_max_drawdown_d5"),
    observed_next_session_positive_sample_size: readInt("observed_next_session_positive_sample_size"),
    observed_next_session_positive_continuation_count: readInt(
      "observed_next_session_positive_continuation_count",
    ),
    observed_next_session_negative_sample_size: readInt("observed_next_session_negative_sample_size"),
    observed_next_session_negative_continuation_count: readInt(
      "observed_next_session_negative_continuation_count",
    ),
  };
}
