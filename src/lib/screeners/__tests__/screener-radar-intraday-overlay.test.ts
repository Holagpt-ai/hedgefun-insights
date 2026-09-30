import { describe, expect, it } from "vitest";
import {
  intradayOverlayObservationCoherent,
  overlayCanonicalIntradayMetrics,
  selectCoherentIntradayDonorForTarget,
  SCREENER_INTRADAY_OVERLAY_MAX_SKEW_MS,
} from "@/lib/screeners/screener-radar-intraday-overlay";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

function screenerRow(partial: Partial<ScreenerResultRow>): ScreenerResultRow {
  return {
    tab_id: "gappers",
    symbol: "ABC",
    company_name: "ABC",
    price: 10,
    change_percent: 8,
    volume: 1_000_000,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: 8,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 100_000,
    volume_ratio_prior_session: 10,
    avg_volume_20d: null,
    rvol_20d: null,
    day_high: null,
    day_low: null,
    provider_as_of: "2026-09-30T14:00:00.000Z",
    sync_run_id: "run",
    updated_at: "2026-09-30T14:00:00.000Z",
    ...partial,
  };
}

describe("canonical intraday overlay", () => {
  it("overlays when same session and timestamps are within skew tolerance", () => {
    const target = screenerRow({ symbol: "ABC" });
    const donor = {
      symbol: "ABC",
      provider_as_of: "2026-09-30T14:05:00.000Z",
      rvol_5m: 6.2,
      vol_velocity: null,
      time_adjusted_rvol: null,
      volume_acceleration_pct: null,
    };
    expect(intradayOverlayObservationCoherent(target, donor)).toBe(true);
    const [merged] = overlayCanonicalIntradayMetrics([target], [donor]);
    expect((merged as { rvol_5m?: number | null }).rvol_5m).toBe(6.2);
  });

  it("does not overlay when timestamps are 30+ minutes apart on the same date", () => {
    const target = screenerRow({
      provider_as_of: "2026-09-30T11:35:00.000Z",
    });
    const donor = {
      symbol: "ABC",
      provider_as_of: "2026-09-30T12:11:00.000Z",
      rvol_5m: 6.2,
      vol_velocity: null,
      time_adjusted_rvol: null,
      volume_acceleration_pct: null,
    };
    expect(intradayOverlayObservationCoherent(target, donor)).toBe(false);
    const [merged] = overlayCanonicalIntradayMetrics([target], [donor]);
    expect((merged as { rvol_5m?: number | null }).rvol_5m).toBeUndefined();
  });

  it("does not overlay across prior trading day", () => {
    const target = screenerRow({ provider_as_of: "2026-09-30T14:00:00.000Z" });
    const donor = {
      symbol: "ABC",
      provider_as_of: "2026-09-29T14:00:00.000Z",
      rvol_5m: 6.2,
      vol_velocity: null,
      time_adjusted_rvol: null,
      volume_acceleration_pct: null,
    };
    expect(intradayOverlayObservationCoherent(target, donor)).toBe(false);
  });

  it("fails closed when timestamps are missing", () => {
    const target = screenerRow({ provider_as_of: "" });
    const donor = {
      symbol: "ABC",
      provider_as_of: "2026-09-30T14:05:00.000Z",
      rvol_5m: 6.2,
      vol_velocity: null,
      time_adjusted_rvol: null,
      volume_acceleration_pct: null,
    };
    expect(intradayOverlayObservationCoherent(target, donor)).toBe(false);
  });

  it("selects target-coherent donor when global freshest is out of skew", () => {
    const target = screenerRow({ provider_as_of: "2026-09-30T11:35:00.000Z" });
    const donors = [
      {
        symbol: "ABC",
        provider_as_of: "2026-09-30T11:40:00.000Z",
        rvol_5m: 4.4,
        vol_velocity: null,
        time_adjusted_rvol: null,
        volume_acceleration_pct: null,
      },
      {
        symbol: "ABC",
        provider_as_of: "2026-09-30T12:11:00.000Z",
        rvol_5m: 9.9,
        vol_velocity: null,
        time_adjusted_rvol: null,
        volume_acceleration_pct: null,
      },
    ];
    expect(selectCoherentIntradayDonorForTarget(target, donors)?.rvol_5m).toBe(4.4);
    const [merged] = overlayCanonicalIntradayMetrics([target], donors);
    expect((merged as { rvol_5m?: number | null }).rvol_5m).toBe(4.4);
  });

  it("selects freshest among multiple coherent donors", () => {
    const target = screenerRow({ provider_as_of: "2026-09-30T14:00:00.000Z" });
    const donor = selectCoherentIntradayDonorForTarget(target, [
      {
        symbol: "ABC",
        provider_as_of: "2026-09-30T14:05:00.000Z",
        rvol_5m: 3,
        vol_velocity: null,
        time_adjusted_rvol: null,
        volume_acceleration_pct: null,
      },
      {
        symbol: "ABC",
        provider_as_of: "2026-09-30T14:10:00.000Z",
        rvol_5m: 9.9,
        vol_velocity: null,
        time_adjusted_rvol: null,
        volume_acceleration_pct: null,
      },
    ]);
    expect(donor?.rvol_5m).toBe(9.9);
  });

  it("does not overwrite existing rvol_5m on target", () => {
    const base = screenerRow({ tab_id: "volume_spikes" }) as ScreenerResultRow & {
      rvol_5m: number;
    };
    base.rvol_5m = 4.1;
    const [merged] = overlayCanonicalIntradayMetrics(
      [base],
      [
        {
          symbol: "ABC",
          provider_as_of: "2026-09-30T14:05:00.000Z",
          rvol_5m: 9.9,
          vol_velocity: null,
          time_adjusted_rvol: null,
          volume_acceleration_pct: null,
        },
      ],
    );
    expect((merged as { rvol_5m?: number | null }).rvol_5m).toBe(4.1);
  });

  it("documents overlay skew aligned to screener stale cadence", () => {
    expect(SCREENER_INTRADAY_OVERLAY_MAX_SKEW_MS).toBe(20 * 60_000);
  });
});
