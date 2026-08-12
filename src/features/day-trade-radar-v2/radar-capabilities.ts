/**
 * Feature-local capability registry.
 * Only advertise what verified data can currently support.
 */
export const RADAR_CAPABILITIES = {
  intradayChart: true,
  hodDistance: true,
  volumeFirstRank: true,
  catalystEnrichment: true,
  /** Official PR / wire classification is not verified in current catalyst types. */
  pressReleaseClassification: false,
  rapidBurstSignals: false,
  halts: false,
  shortInterest: false,
  float: false,
  issuerRegion: false,
  vwap: false,
  radarPulse: false,
} as const;

export type RadarCapabilityKey = keyof typeof RADAR_CAPABILITIES;

export function isRadarCapabilityEnabled(key: RadarCapabilityKey): boolean {
  return RADAR_CAPABILITIES[key] === true;
}
