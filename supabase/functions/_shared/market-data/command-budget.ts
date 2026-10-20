/**
 * Command estimate for Upstash Redis Free (500,000 commands / month).
 *
 * Steady-state origin fill, verified client:
 *   GET + SET + INCR global + INCR client = 4
 * Each extra warm isolate pays one GET while its memory entry is cold.
 * EXPIRE is once per new quota key, not once per request.
 * Memory hits cost zero commands. Other market-data types cost zero.
 */

export type RedisTrafficScenario = {
  tradingDays: number;
  marketHoursPerDay: number;
  warmIsolates: number;
  hotSnapshotKeys: number;
  hotLiveAggregateKeys: number;
  closedAggregateRefreshesPerDay: number;
  eveningFractionOfMarketLiveCommands: number;
  distinctVerifiedIps: number;
  liveServeWindowSeconds: number;
  globalQuotaWindowSeconds: number;
  clientQuotaWindowSeconds: number;
  verifiedClients: boolean;
};

export const NORMAL_REDIS_TRAFFIC: RedisTrafficScenario = {
  tradingDays: 22,
  marketHoursPerDay: 7,
  warmIsolates: 2,
  hotSnapshotKeys: 8,
  hotLiveAggregateKeys: 4,
  closedAggregateRefreshesPerDay: 40,
  eveningFractionOfMarketLiveCommands: 0.15,
  distinctVerifiedIps: 5,
  liveServeWindowSeconds: 120,
  globalQuotaWindowSeconds: 60,
  clientQuotaWindowSeconds: 300,
  verifiedClients: true,
};

export type RedisBudgetEstimate = {
  monthlyCommands: number;
  monthlyCacheCommands: number;
  monthlyExpireCommands: number;
  commandsPerExtraHotKey: number;
  commandsPerExtraIsolatePerHotKey: number;
};

export function estimateMonthlyRedisCommands(input: RedisTrafficScenario): RedisBudgetEstimate {
  const windowsPerMarketHour = 3600 / input.liveServeWindowSeconds;
  const hotKeys = input.hotSnapshotKeys + input.hotLiveAggregateKeys;
  const perKeyPerWindow = (input.verifiedClients ? 4 : 3) + Math.max(0, input.warmIsolates - 1);
  const activeFactor = 1 + input.eveningFractionOfMarketLiveCommands;
  const marketLive = hotKeys * windowsPerMarketHour * input.marketHoursPerDay * perKeyPerWindow;
  const eveningLive = marketLive * input.eveningFractionOfMarketLiveCommands;
  const closed = input.closedAggregateRefreshesPerDay * perKeyPerWindow;
  const monthlyCache = (marketLive + eveningLive + closed) * input.tradingDays;

  const activeMinutesPerDay = input.marketHoursPerDay * 60 * activeFactor;
  const globalExpire = input.tradingDays * activeMinutesPerDay * (60 / input.globalQuotaWindowSeconds) * 2;
  const clientWindowsPerDay = activeMinutesPerDay * (60 / input.clientQuotaWindowSeconds);
  const clientExpire = input.verifiedClients
    ? input.tradingDays * clientWindowsPerDay * input.distinctVerifiedIps * 2
    : 0;

  return {
    monthlyCommands: Math.round(monthlyCache + globalExpire + clientExpire),
    monthlyCacheCommands: Math.round(monthlyCache),
    monthlyExpireCommands: Math.round(globalExpire + clientExpire),
    commandsPerExtraHotKey: Math.round(
      input.tradingDays * windowsPerMarketHour * input.marketHoursPerDay * activeFactor * perKeyPerWindow,
    ),
    commandsPerExtraIsolatePerHotKey: Math.round(
      input.tradingDays * windowsPerMarketHour * input.marketHoursPerDay * activeFactor,
    ),
  };
}
