import { describe, expect, it } from "vitest";
import {
  compareRadarGainersLosers,
  compareRadarUnusualVolume,
  compareRadarVolumeSpikes,
  highActivityTier,
  qualifiesRadarGainersLosers,
  qualifiesRadarUnusualVolume,
  qualifiesRadarVolumeSpike,
  qualifyRadarCandidateForTab,
  SCANNER_HIGH_ACTIVITY_SHARES_PER_MIN,
  type RadarTabCandidate,
} from "@/lib/screeners/scanner-tab-qualification";

function row(overrides: Partial<RadarTabCandidate> = {}): RadarTabCandidate {
  return {
    symbol: "AAA",
    last_price: 10,
    previous_close: 8,
    session_volume: 1_000_000,
    prior_session_volume: 200_000,
    volume_velocity: 80_000,
    volume_acceleration_pct: 12,
    volume_60s: 80_000,
    time_adjusted_rvol: null,
    ...overrides,
  };
}

describe("Radar tab qualification — Volume Spikes vs Unusual Volume", () => {
  it("keeps the two scanners independent", () => {
    const velocityOnly = row({
      symbol: "VEL",
      volume_velocity: 150_000,
      prior_session_volume: 900_000,
      time_adjusted_rvol: null,
    });
    const unusualOnly = row({
      symbol: "UNU",
      volume_velocity: null,
      volume_acceleration_pct: null,
      prior_session_volume: 100_000,
      session_volume: 500_000,
    });

    expect(qualifiesRadarVolumeSpike(velocityOnly)).toBe(true);
    expect(qualifiesRadarUnusualVolume(velocityOnly)).toBe(false);

    expect(qualifiesRadarVolumeSpike(unusualOnly)).toBe(false);
    expect(qualifiesRadarUnusualVolume(unusualOnly)).toBe(true);
  });

  it("does not treat session volume alone as a spike or unusual print", () => {
    const volumeOnly = row({
      volume_velocity: null,
      volume_acceleration_pct: null,
      prior_session_volume: null,
      time_adjusted_rvol: null,
    });
    expect(qualifiesRadarVolumeSpike(volumeOnly)).toBe(false);
    expect(qualifiesRadarUnusualVolume(volumeOnly)).toBe(false);
  });

  it("unusual volume accepts time-adjusted RVOL without inventing VOL/YDAY", () => {
    const tarvol = row({
      prior_session_volume: null,
      time_adjusted_rvol: 2.4,
      volume_velocity: null,
      volume_acceleration_pct: null,
    });
    expect(qualifiesRadarUnusualVolume(tarvol)).toBe(true);
    expect(qualifiesRadarVolumeSpike(tarvol)).toBe(false);
  });

  it("gainers/losers require a session MOVE, not a 15s/60s print", () => {
    expect(qualifiesRadarGainersLosers(row({ previous_close: 8, last_price: 10 }))).toBe(true);
    expect(qualifiesRadarGainersLosers(row({ previous_close: null, last_price: 10 }))).toBe(false);
    expect(qualifiesRadarGainersLosers(row({ previous_close: 10, last_price: 10 }))).toBe(false);
  });

  it("tab dispatcher matches the distinct scanners", () => {
    const spike = row({ volume_velocity: 120_000, prior_session_volume: 800_000 });
    expect(qualifyRadarCandidateForTab(spike, "volume_spikes")).toBe(true);
    expect(qualifyRadarCandidateForTab(spike, "unusual_volume")).toBe(false);
    expect(qualifyRadarCandidateForTab(spike, "gainers_losers")).toBe(true);
    expect(qualifyRadarCandidateForTab(spike, "gappers")).toBe(false);
  });
});

describe("Radar tab ranking — volume is king", () => {
  it("places ≥100k shares/min ahead of a higher-ratio thin name", () => {
    const thin = row({
      symbol: "THIN",
      volume_velocity: 8_000,
      volume_60s: 8_000,
      session_volume: 80_000,
      time_adjusted_rvol: 9,
      prior_session_volume: 10_000,
    });
    const heavy = row({
      symbol: "HEVY",
      volume_velocity: SCANNER_HIGH_ACTIVITY_SHARES_PER_MIN,
      volume_60s: SCANNER_HIGH_ACTIVITY_SHARES_PER_MIN,
      session_volume: 400_000,
      time_adjusted_rvol: 2.1,
      prior_session_volume: 90_000,
    });
    expect(highActivityTier(heavy)).toBe(0);
    expect(highActivityTier(thin)).toBe(1);
    expect(compareRadarVolumeSpikes(heavy, thin)).toBeLessThan(0);
    expect(compareRadarUnusualVolume(heavy, thin)).toBeLessThan(0);
  });

  it("ranks spikes by velocity then session volume", () => {
    const a = row({ symbol: "A", volume_velocity: 200_000, session_volume: 1_000_000 });
    const b = row({ symbol: "B", volume_velocity: 400_000, session_volume: 900_000 });
    expect(compareRadarVolumeSpikes(b, a)).toBeLessThan(0);
  });

  it("ranks gainers by |session MOVE| after the activity tier", () => {
    const small = row({ symbol: "SML", last_price: 10.5, previous_close: 10, volume_velocity: 20_000, volume_60s: 20_000 });
    const large = row({ symbol: "LRG", last_price: 14, previous_close: 10, volume_velocity: 20_000, volume_60s: 20_000 });
    expect(compareRadarGainersLosers(large, small)).toBeLessThan(0);
  });
});
