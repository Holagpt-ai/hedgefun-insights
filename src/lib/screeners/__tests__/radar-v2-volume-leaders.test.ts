import { describe, expect, it } from "vitest";
import {
  buildRadarV2Decision,
  type RadarV2CandidateRow,
  type RadarV2Decision,
  type RadarV2FeedStateRow,
} from "@/lib/screeners/radar-v2-adapter";
import {
  LEGACY_VOLUME_LEADERS_SUBTITLE,
  RADAR_V2_PM_VOLUME_LEADERS_EMPTY,
  RADAR_V2_PM_VOLUME_LEADERS_SUBTITLE,
  RADAR_V2_VOLUME_LEADERS_UNAVAILABLE_REASON,
  mapRadarV2RowsToVolumeLeaders,
  resolveVolumeLeadersView,
  volumeLeadersFromRadarDecision,
} from "@/lib/screeners/radar-v2-volume-leaders";
import type { PreMarketVolumeLeader, SectionEnvelope } from "@/types/pre-market";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const NOW = Date.parse("2026-09-04T11:12:57.000Z");
const SYNCED = "2026-09-04T11:12:30.000Z";

function candidate(overrides: Partial<RadarV2CandidateRow> = {}): RadarV2CandidateRow {
  return {
    symbol: "IMRN",
    generation_id: GEN,
    trading_date: "2026-09-04",
    session_kind: "pre-market",
    lifecycle: "ACTIVE",
    signal_status: "EXPLOSIVE",
    last_price: 4.2,
    move_15s_pct: 1,
    move_60s_pct: 2,
    volume_5s: 1,
    volume_15s: 1,
    volume_60s: 1,
    session_volume: 9_000_000,
    dollar_volume_60s: 1,
    acceleration_5m: 0,
    session_high: 5,
    session_low: 3,
    distance_from_hod_pct: 1,
    session_vwap: 4,
    vwap_side: "above",
    freshness_class: "fresh",
    provider_as_of: "2026-09-04T10:57:30.000Z",
    updated_at: SYNCED,
    ...overrides,
  };
}

function feed(overrides: Partial<RadarV2FeedStateRow> = {}): RadarV2FeedStateRow {
  return {
    state_key: "current",
    session_kind: "pre-market",
    sentinel_enabled: true,
    candidate_count: 3,
    v2_generation_id: GEN,
    v2_synced_at: SYNCED,
    last_receive_at: SYNCED,
    last_provider_event_at: "2026-09-04T10:57:30.000Z",
    feed_stale: false,
    updated_at: SYNCED,
    ...overrides,
  };
}

function screenerRow(symbol: string, volume: number): ScreenerResultRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: "FAKE NAME INC",
    price: 10,
    change_percent: 12.5,
    volume,
    avg_volume: 1,
    rvol: 9.9,
    float_shares: null,
    gap_percent: 8,
    high_52w: 20,
    low_52w: 1,
    range_event: null,
    market_cap: null,
    prior_session_volume: 100,
    volume_ratio_prior_session: 5,
    day_high: 11,
    day_low: 9,
    provider_as_of: SYNCED,
    sync_run_id: GEN,
    updated_at: SYNCED,
  };
}

function workspaceSection(
  rows: PreMarketVolumeLeader[],
): SectionEnvelope<PreMarketVolumeLeader[]> {
  return { status: "available", data: rows, as_of: SYNCED, reason_code: null };
}

describe("Pre-Market Volume Leaders ← Radar V2 (D11)", () => {
  it("9. uses Radar V2 rows during confirmed pre-market", () => {
    const decision = buildRadarV2Decision({
      feedRows: [feed({ candidate_count: 3 })],
      candidateRows: [
        candidate({ symbol: "IMRN", session_volume: 9_000_000 }),
        candidate({ symbol: "BAOS", session_volume: 4_000_000 }),
        candidate({ symbol: "SNXX", session_volume: 1_000_000 }),
      ],
      tabId: "day_trade_radar",
      nowMs: NOW,
    });
    const view = resolveVolumeLeadersView({
      premarketActive: true,
      workspaceLoading: false,
      workspaceSection: workspaceSection([{
        symbol: "LEGACY",
        company_name: "Should Not Appear",
        price: 1,
        change_percent: 1,
        volume: 99,
        rvol: 1,
        updated_at: SYNCED,
      }]),
      radarLoading: false,
      radarDecision: decision,
    });
    expect(view.source).toBe("radar-v2");
    expect(view.section?.status).toBe("available");
    expect(view.section?.data.map((r) => r.symbol)).toEqual(["IMRN", "BAOS", "SNXX"]);
    expect(view.section?.data.map((r) => r.symbol)).not.toContain("LEGACY");
    expect(view.subtitle).toBe(RADAR_V2_PM_VOLUME_LEADERS_SUBTITLE);
    expect(view.subtitle).not.toMatch(/not session-attributed/i);
    expect(view.emptyMessage).toBe(RADAR_V2_PM_VOLUME_LEADERS_EMPTY);
  });

  it("10. stays volume-descending", () => {
    const rows = mapRadarV2RowsToVolumeLeaders([
      screenerRow("HIGH", 9_000_000),
      screenerRow("MID", 4_000_000),
      screenerRow("LOW", 1_000_000),
    ]);
    expect(rows.map((r) => r.symbol)).toEqual(["HIGH", "MID", "LOW"]);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].volume! >= rows[i].volume!).toBe(true);
    }
  });

  it("11. does not invent RVOL / prior-close / gap / company name / catalyst", () => {
    const rows = mapRadarV2RowsToVolumeLeaders([
      screenerRow("IMRN", 9_000_000),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].rvol).toBeNull();
    expect(rows[0].change_percent).toBeNull();
    expect(rows[0].company_name).toBeNull();
    expect(rows[0]).not.toHaveProperty("gap_percent");
    expect(rows[0]).not.toHaveProperty("catalyst");
  });

  it("12. existing RTH behavior is unchanged", () => {
    const workspace = workspaceSection([{
      symbol: "RTH1",
      company_name: "Real Co",
      price: 12,
      change_percent: 3,
      volume: 500_000,
      rvol: 2.1,
      updated_at: SYNCED,
    }]);
    const view = resolveVolumeLeadersView({
      premarketActive: false,
      workspaceLoading: false,
      workspaceSection: workspace,
      radarLoading: false,
      radarDecision: {
        source: "radar-v2",
        reason: "radar_v2_available",
        session: "pre-market",
        view: { status: "available", rows: [screenerRow("IMRN", 9_000_000)], synced_at: SYNCED, provider_as_of_max: null },
      },
    });
    expect(view.source).toBe("screener-results");
    expect(view.section).toBe(workspace);
    expect(view.section?.data[0].symbol).toBe("RTH1");
    expect(view.subtitle).toBe(LEGACY_VOLUME_LEADERS_SUBTITLE);
    expect(view.subtitle).toContain("not session-attributed");
  });

  it("healthy Radar V2 empty is an honest empty, not a fake row", () => {
    const decision: RadarV2Decision = {
      source: "radar-v2",
      reason: "radar_v2_empty",
      session: "pre-market",
      view: { status: "empty", rows: [], synced_at: SYNCED, provider_as_of_max: null },
    };
    const view = resolveVolumeLeadersView({
      premarketActive: true,
      workspaceLoading: false,
      workspaceSection: workspaceSection([]),
      radarLoading: false,
      radarDecision: decision,
    });
    expect(view.source).toBe("radar-v2");
    expect(view.section?.status).toBe("empty");
    expect(view.section?.data).toEqual([]);
    expect(view.emptyMessage).toBe(RADAR_V2_PM_VOLUME_LEADERS_EMPTY);
  });

  it("Radar V2 unavailable after retries is an honest unavailable state", () => {
    const decision: RadarV2Decision = {
      source: "fallback",
      reason: "radar_v2_retry_exhausted",
      session: "pre-market",
      view: null,
    };
    const mapped = volumeLeadersFromRadarDecision(decision);
    expect(mapped.status).toBe("unavailable");
    expect(mapped.reason_code).toBe(RADAR_V2_VOLUME_LEADERS_UNAVAILABLE_REASON);
    const view = resolveVolumeLeadersView({
      premarketActive: true,
      workspaceLoading: false,
      workspaceSection: workspaceSection([]),
      radarLoading: false,
      radarDecision: decision,
    });
    expect(view.source).toBe("unavailable");
    expect(view.section?.status).toBe("unavailable");
    expect(view.subtitle).not.toMatch(/not session-attributed/i);
  });
});
