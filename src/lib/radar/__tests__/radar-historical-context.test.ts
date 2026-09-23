import { describe, expect, it, vi } from "vitest";
import { buildRadarV2Decision, rankRadarV2Candidates, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";
import { MemoryBehaviorProfileRepository } from "@/lib/behavior-profile/behavior-profile-repository";
import { buildSecurityBehaviorProfile } from "@/lib/behavior-profile/build-security-behavior-profile";
import {
  attachHistoricalContextToRadarRows,
  radarRowRankFingerprint,
} from "@/lib/radar/enrich-radar-historical-context";
import { mapRadarRowToRepeatMoverInput } from "@/lib/radar/map-radar-row-to-repeat-mover-input";
import { assertRepeatMoverContextIsEvidenceOnly, getRepeatMoverContext } from "@/lib/repeat-movers/get-repeat-mover-context";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";
const NOW = Date.parse("2026-09-22T16:00:00.000Z");

function candidate(symbol: string, volume: number): RadarV2CandidateRow {
  return {
    symbol,
    generation_id: "gen-1",
    trading_date: "2026-09-22",
    session_kind: "market",
    lifecycle: "ACTIVE",
    signal_status: "EXPLOSIVE",
    last_price: 10,
    move_15s_pct: null,
    move_60s_pct: 5,
    volume_5s: 100,
    volume_15s: 200,
    volume_60s: 500,
    session_volume: volume,
    dollar_volume_60s: 5000,
    acceleration_5m: 1,
    rvol_5m: null,
    volume_velocity: null,
    volume_acceleration_pct: null,
    session_high: 11,
    session_low: 9,
    distance_from_hod_pct: 1,
    session_vwap: 10,
    vwap_side: "above",
    freshness_class: "fresh",
    provider_as_of: "2026-09-22T15:59:00.000Z",
    updated_at: "2026-09-22T15:59:30.000Z",
  };
}

function screenerRow(symbol: string, volume: number): RadarV2ScreenerRow {
  const decision = buildRadarV2Decision({
    feedRows: [{
      state_key: "current",
      session_kind: "market",
      sentinel_enabled: true,
      candidate_count: 1,
      v2_generation_id: "gen-1",
      v2_synced_at: "2026-09-22T15:59:30.000Z",
      last_receive_at: "2026-09-22T15:59:30.000Z",
      last_provider_event_at: null,
      feed_stale: false,
      updated_at: "2026-09-22T15:59:30.000Z",
    }],
    candidateRows: [candidate(symbol, volume)],
    tabId: "day_trade_radar",
    nowMs: NOW,
  });
  const row = decision.view!.rows[0] as RadarV2ScreenerRow;
  return { ...row, radar_rank: 1 };
}

describe("Radar historical context enrichment", () => {
  it("maps radar row fields without inferring missing RVOL", () => {
    const mapped = mapRadarRowToRepeatMoverInput(screenerRow("ABC", 1_000_000));
    expect(mapped.rvol).toBeNull();
    expect(mapped.movePct).toBe(5);
    expect(mapped.volume).toBe(1_000_000);
  });

  it("does not change rank fingerprint after enrichment", async () => {
    const rows = [
      screenerRow("AAA", 2_000_000),
      screenerRow("BBB", 1_000_000),
    ];
    const before = radarRowRankFingerprint(rows);

    const enriched = await attachHistoricalContextToRadarRows(rows, {
      resolveSecurityId: async () => null,
      loadContext: async () => {
        throw new Error("should not load");
      },
    });

    expect(radarRowRankFingerprint(enriched)).toBe(before);
    expect(enriched.map((row) => row.symbol)).toEqual(["AAA", "BBB"]);
  });

  it("attaches profile context and fails soft without security id", async () => {
    const rows = [screenerRow("ABC", 900_000)];
    const enriched = await attachHistoricalContextToRadarRows(rows, {
      resolveSecurityId: async () => null,
      loadContext: vi.fn(),
    });
    expect(enriched[0]?.historicalContext).toBeNull();
    expect(enriched[0]?.securityId).toBeNull();
  });

  it("attaches repeat mover context when profile exists", async () => {
    const profiles = new MemoryBehaviorProfileRepository();
    const built = buildSecurityBehaviorProfile({
      securityId: SECURITY_ID,
      dailyHistory: [{
        securityId: SECURITY_ID,
        sessionDate: "2024-01-02",
        observedSymbol: "ABC",
        exchange: "NASDAQ",
        open: 10,
        high: 11,
        low: 9,
        close: 10.5,
        volume: 1_000_000,
        dollarVolume: null,
        previousClose: 10,
        movePct: 5,
        source: "test",
        sourceAsOf: null,
        fetchedAt: null,
        computedAt: NOW.toString(),
        quality: "DERIVED",
        freshness: "UNKNOWN",
        provenance: "DERIVED",
      }],
      episodes: [],
      computedAt: new Date(NOW).toISOString(),
      config: { minSessionsForLimitedQuality: 1 },
    });
    await profiles.upsertSecurityBehaviorProfile(built);

    const rows = [screenerRow("ABC", 900_000)];
    const enriched = await attachHistoricalContextToRadarRows(rows, {
      resolveSecurityId: async () => SECURITY_ID,
      loadContext: ({ securityId, currentContext }) => getRepeatMoverContext({
        securityId,
        currentContext,
        data: {
          getBehaviorProfile: () => profiles.getSecurityBehaviorProfile(securityId),
          listDailyHistory: async () => [],
          listEpisodes: async () => [],
        },
      }),
    });

    expect(enriched[0]?.historicalContext?.profile.profileAvailable).toBe(true);
    assertRepeatMoverContextIsEvidenceOnly(enriched[0]!.historicalContext!);
  });

  it("bridge failure fails soft and leaves row metrics intact", async () => {
    const row = screenerRow("ABC", 500_000);
    const enriched = await attachHistoricalContextToRadarRows([row], {
      resolveSecurityId: async () => SECURITY_ID,
      loadContext: async () => {
        throw new Error("bridge_down");
      },
    });
    expect(enriched[0]?.volume).toBe(500_000);
    expect(enriched[0]?.historicalContext).toBeNull();
  });

  it("rankRadarV2Candidates order is independent of enrichment module", () => {
    const ranked = rankRadarV2Candidates([
      candidate("LOW", 100),
      candidate("HIGH", 500),
    ]);
    expect(ranked[0]?.symbol).toBe("HIGH");
  });
});
