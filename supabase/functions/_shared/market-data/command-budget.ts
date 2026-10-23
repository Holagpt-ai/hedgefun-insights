/**
 * Redis command estimate for Upstash Free (500,000 commands / month).
 *
 * Live quotes and live charts are memory-cached and spend Redis on an atomic INCR per
 * Massive attempt. Shared live payloads may also GET/SET on an L1 miss (see
 * REDIS_COMMAND_BUDGET.md). Closed aggregate windows GET/SET a shared payload.
 * Per-IP counters are not used.
 *
 * A cold isolate does not add a Redis GET per frontend request. Extra origin attempts
 * stop at the shared cap, so request floods increase rejections rather than INCRs.
 */

export const FREE_TIER_MONTHLY_COMMANDS = 500_000;

export type RedisTrafficScenario = {
  name: string;
  tradingDays: number;
  marketHoursPerDay: number;
  eveningFraction: number;
  warmIsolates: number;
  hotSnapshotKeys: number;
  hotLiveAggregateKeys: number;
  snapshotMemorySeconds: number;
  liveAggregateMemorySeconds: number;
  snapshotCapPerMinute: number;
  aggregateCapPerMinute: number;
  /** Fraction of origin attempts that retry once (429/5xx). */
  retryFraction: number;
  closedAggregateRefreshesPerDay: number;
  /** Extra Redis commands from timeouts before the circuit opens. */
  timeoutCommandsPerDay: number;
};

export const WARM_REDIS_TRAFFIC: RedisTrafficScenario = {
  name: "warm",
  tradingDays: 22,
  marketHoursPerDay: 7,
  eveningFraction: 0.15,
  warmIsolates: 2,
  hotSnapshotKeys: 8,
  hotLiveAggregateKeys: 4,
  snapshotMemorySeconds: 30,
  liveAggregateMemorySeconds: 60,
  snapshotCapPerMinute: 18,
  aggregateCapPerMinute: 8,
  retryFraction: 0.05,
  closedAggregateRefreshesPerDay: 40,
  timeoutCommandsPerDay: 20,
};

export const COLD_REDIS_TRAFFIC: RedisTrafficScenario = {
  ...WARM_REDIS_TRAFFIC,
  name: "cold",
  warmIsolates: 8,
  retryFraction: 0.1,
  timeoutCommandsPerDay: 80,
};

export const INCREASED_REDIS_TRAFFIC: RedisTrafficScenario = {
  ...COLD_REDIS_TRAFFIC,
  name: "increased",
  hotSnapshotKeys: 24,
  hotLiveAggregateKeys: 12,
  closedAggregateRefreshesPerDay: 120,
};

export const DEGRADED_REDIS_TRAFFIC: RedisTrafficScenario = {
  ...COLD_REDIS_TRAFFIC,
  name: "degraded",
  retryFraction: 0.25,
  timeoutCommandsPerDay: 400,
};

export type RedisBudgetEstimate = {
  monthlyCommands: number;
  headroomCommands: number;
  capped: boolean;
  uncappedAttemptCommands: number;
};

export function estimateMonthlyRedisCommands(input: RedisTrafficScenario): RedisBudgetEstimate {
  const activeMinutesPerDay = input.marketHoursPerDay * 60 * (1 + input.eveningFraction);
  const activeMinutes = activeMinutesPerDay * input.tradingDays;
  const snapshotRefreshPerMinute = input.hotSnapshotKeys * (60 / input.snapshotMemorySeconds);
  const aggregateRefreshPerMinute = input.hotLiveAggregateKeys * (60 / input.liveAggregateMemorySeconds);
  const uncappedAttemptsPerMinute = (snapshotRefreshPerMinute + aggregateRefreshPerMinute) * (1 + input.retryFraction);
  const cappedAttemptsPerMinute = Math.min(
    snapshotRefreshPerMinute * (1 + input.retryFraction),
    input.snapshotCapPerMinute,
  ) + Math.min(
    aggregateRefreshPerMinute * (1 + input.retryFraction),
    input.aggregateCapPerMinute,
  );
  const attemptCommands = cappedAttemptsPerMinute * activeMinutes;
  const expireCommands = 2 * activeMinutes;
  const closedPayloadCommands = input.closedAggregateRefreshesPerDay * input.tradingDays * 2;
  const timeoutCommands = input.timeoutCommandsPerDay * input.tradingDays;
  const monthlyCommands = Math.round(attemptCommands + expireCommands + closedPayloadCommands + timeoutCommands);
  return {
    monthlyCommands,
    headroomCommands: FREE_TIER_MONTHLY_COMMANDS - monthlyCommands,
    capped: uncappedAttemptsPerMinute > cappedAttemptsPerMinute,
    uncappedAttemptCommands: Math.round(uncappedAttemptsPerMinute * activeMinutes),
  };
}
