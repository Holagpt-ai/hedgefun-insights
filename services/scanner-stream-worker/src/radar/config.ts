export type RadarV22Config = {
  evaluationIntervalMs: number;
  boardRowCap: number;
  globalFeedStaleMs: number;
  highActivityShares60s: number;
  detectVol5s: number;
  detectVol15s: number;
  detectVol60sFloor: number;
  activeVol60s: number;
  activeVol15s: number;
  activeMove15sPct: number;
  activeMove60sPct: number;
  coolingConfirmEvals: number;
  archiveCoolingMs: number;
  archiveRolling60Ceiling: number;
  archiveLowActivityEvals: number;
  reactivateConfirmEvals: number;
  lateCorrectionMs: number;
  snapshotRefreshMs: number;
  detectConfirmEvals: number;
  confirmingEvals: number;
  activeConfirmEvals: number;
  leaseTtlMs: number;
  leaseRenewMs: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  reconnectJitter: number;
  barRetentionMs: number;
  snapshotPageCap: number;
  snapshotTimeoutMs: number;
};

export const RADAR_V22_CONFIG: RadarV22Config = {
  evaluationIntervalMs: 5_000,
  boardRowCap: 20,
  globalFeedStaleMs: 15_000,
  highActivityShares60s: 100_000,
  detectVol5s: 10_000,
  detectVol15s: 25_000,
  detectVol60sFloor: 50_000,
  activeVol60s: 100_000,
  activeVol15s: 25_000,
  activeMove15sPct: 0.25,
  activeMove60sPct: 0.50,
  coolingConfirmEvals: 3,
  archiveCoolingMs: 5 * 60 * 1000,
  archiveRolling60Ceiling: 50_000,
  archiveLowActivityEvals: 12,
  reactivateConfirmEvals: 3,
  lateCorrectionMs: 10_000,
  snapshotRefreshMs: 5 * 60 * 1000,
  detectConfirmEvals: 1,
  confirmingEvals: 2,
  activeConfirmEvals: 3,
  leaseTtlMs: 15_000,
  leaseRenewMs: 5_000,
  reconnectBaseDelayMs: 500,
  reconnectMaxDelayMs: 15_000,
  reconnectJitter: 0.2,
  barRetentionMs: 6 * 60 * 1000,
  snapshotPageCap: 50,
  snapshotTimeoutMs: 15_000,
};

export function mergeRadarConfig(
  overrides: Partial<RadarV22Config> = {},
): RadarV22Config {
  return { ...RADAR_V22_CONFIG, ...overrides };
}
