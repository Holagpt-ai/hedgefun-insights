import { describe, expect, it } from "vitest";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import {
  fetchAndMergeRadarHistoricalContext,
  mergeHistoricalContextBatchIntoRows,
} from "@/lib/radar/apply-radar-historical-context";
import { RadarHistoricalContextHttpError } from "@/lib/radar/radar-historical-context-client";
import { buildRadarRepeatMoversView } from "@/lib/radar/build-radar-repeat-movers-view";

function radarRow(symbol: string): RadarV2ScreenerRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: `${symbol} Corp`,
    price: 10,
    change_percent: 5,
    volume: 1_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: null,
    rvol_20d: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 100_000,
    volume_ratio_prior_session: 5,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-16T15:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-16T15:05:00.000Z",
  } as RadarV2ScreenerRow;
}

describe("apply-radar-historical-context HTTP classification", () => {
  it("D: HTTP 200 malformed ticker context coerces to null without throwing", () => {
    const merged = mergeHistoricalContextBatchIntoRows([radarRow("AAA")], {
      results: [{
        symbol: "AAA",
        securityId: "sec-1",
        historicalContext: {
          profile: { profileAvailable: true, episodeCount: 1 },
        } as never,
      }],
    });
    expect(merged[0]?.historicalContext).toBeNull();
  });

  it("C: honest empty repeat movers after valid empty batch", () => {
    const merged = mergeHistoricalContextBatchIntoRows([radarRow("AAA"), radarRow("BBB")], {
      results: [
        { symbol: "AAA", securityId: null, historicalContext: null },
        { symbol: "BBB", securityId: null, historicalContext: null },
      ],
    });
    const view = buildRadarRepeatMoversView(merged, { nowMs: Date.now() });
    expect(view.summary.repeatMoverCount).toBe(0);
    expect(view.repeatMovers).toHaveLength(0);
  });

  it("propagates HTTP 500 from fetchBatch without merging empty-success rows", async () => {
    await expect(
      fetchAndMergeRadarHistoricalContext({
        rows: [radarRow("AAA")],
        fetchBatch: async () => {
          throw new RadarHistoricalContextHttpError(500);
        },
      }),
    ).rejects.toBeInstanceOf(RadarHistoricalContextHttpError);
  });

  it("F: retry after HTTP failure can merge and build honest empty view", async () => {
    const rows = [radarRow("AAA")];
    await expect(
      fetchAndMergeRadarHistoricalContext({
        rows,
        fetchBatch: async () => {
          throw new RadarHistoricalContextHttpError(500);
        },
      }),
    ).rejects.toBeInstanceOf(RadarHistoricalContextHttpError);

    const merged = await fetchAndMergeRadarHistoricalContext({
      rows,
      fetchBatch: async () => ({
        results: [{ symbol: "AAA", securityId: null, historicalContext: null }],
      }),
    });
    const view = buildRadarRepeatMoversView(merged, { nowMs: Date.now() });
    expect(view.summary.repeatMoverCount).toBe(0);
  });
});
