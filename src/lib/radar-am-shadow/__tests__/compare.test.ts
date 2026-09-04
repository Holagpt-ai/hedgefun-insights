import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  viewRadarV22Generation,
  type RadarV22BoardRow,
  type RadarV22FeedState,
  type RadarV22View,
} from "@/lib/radar-v22";
import {
  compareAmRadarShadow,
  formatAmRadarShadowReport,
  hodDistancePct,
  selectAmVolumeLeaders,
  type AmScreenerShadowRow,
  type ShadowCompareInput,
} from "@/lib/radar-am-shadow";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const TODAY = "2026-08-26";
/** Wednesday 15:30 ET — regular session. */
const NOW_RTH = Date.parse("2026-08-26T19:30:00.000Z");
/** Wednesday 08:15 ET — pre-market. */
const NOW_PRE = Date.parse("2026-08-26T12:15:00.000Z");
/** Wednesday 17:00 ET — after hours. */
const NOW_AH = Date.parse("2026-08-26T21:00:00.000Z");
/** Saturday 11:00 ET — weekend closed. */
const NOW_WEEKEND = Date.parse("2026-08-29T15:00:00.000Z");

function screenerRow(
  symbol: string,
  volume: number,
  extra: Partial<AmScreenerShadowRow> = {},
): AmScreenerShadowRow {
  return {
    symbol,
    company_name: symbol,
    price: 10,
    change_percent: 12,
    volume,
    rvol: 5,
    updated_at: "2026-08-26T19:20:00.000Z",
    provider_as_of: "2026-08-26T19:10:00.000Z",
    ...extra,
  };
}

function boardRow(
  symbol: string,
  rank: number,
  extra: Partial<RadarV22BoardRow> = {},
): RadarV22BoardRow {
  return {
    generation_id: GEN,
    rank,
    symbol,
    company_name: symbol,
    lifecycle: "ACTIVE",
    signal_status: "EXPLOSIVE",
    price: 10,
    change_percent: 12,
    volume: 1_000_000,
    prior_session_volume: 100_000,
    volume_ratio_prior_session: 10,
    day_high: 11,
    day_low: 9,
    rolling_volume_5s: 20_000,
    rolling_volume_15s: 40_000,
    rolling_volume_60s: 120_000,
    rolling_dollar_volume_60s: 1_200_000,
    acceleration_5m: null,
    session_vwap: 10.1,
    peak_volume_15s: 40_000,
    provider_as_of: "2026-08-26T19:29:50.000Z",
    updated_at: "2026-08-26T19:29:55.000Z",
    ...extra,
  };
}

function v22State(
  rows: RadarV22BoardRow[],
  extra: Partial<RadarV22FeedState> = {},
): RadarV22FeedState {
  return {
    state_key: "current",
    generation_id: GEN,
    status: rows.length === 0 ? "empty" : "available",
    session_date: TODAY,
    synced_at: "2026-08-26T19:29:55.000Z",
    provider_as_of_min: rows[0]?.provider_as_of ?? null,
    provider_as_of_max: rows[0]?.provider_as_of ?? null,
    last_provider_event_at: rows[0]?.provider_as_of ?? null,
    symbol_count: rows.length,
    feed_stale: false,
    updated_at: "2026-08-26T19:29:55.000Z",
    ...extra,
  };
}

function v22View(rows: RadarV22BoardRow[], todayEt = TODAY): RadarV22View {
  return viewRadarV22Generation([v22State(rows)], rows, todayEt);
}

function compare(partial: Partial<ShadowCompareInput> & Pick<ShadowCompareInput, "screenerRows" | "v22View">) {
  return compareAmRadarShadow({
    nowMs: NOW_RTH,
    v22RawState: null,
    v22RawRows: null,
    ...partial,
  });
}

describe("AM Radar shadow comparison", () => {
  it("identical Top 3", () => {
    const screener = [
      screenerRow("ABC", 14_200_000),
      screenerRow("XYZ", 11_900_000),
      screenerRow("DEF", 8_400_000),
    ];
    const board = [
      boardRow("ABC", 1, { volume: 14_200_000 }),
      boardRow("XYZ", 2, { volume: 11_900_000 }),
      boardRow("DEF", 3, { volume: 8_400_000 }),
    ];
    const result = compare({
      screenerRows: screener,
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    });
    expect(result.screenerTop3.map((r) => r.symbol)).toEqual(["ABC", "XYZ", "DEF"]);
    expect(result.v22Top3.map((r) => r.symbol)).toEqual(["ABC", "XYZ", "DEF"]);
    expect(result.overlapCount).toBe(3);
    expect(result.orderingDifferences).toEqual([]);
    expect(result.volume.volumeFirstLeaderMatch).toBe(true);
  });

  it("partial Top-3 overlap", () => {
    const screener = [
      screenerRow("ABC", 14_200_000),
      screenerRow("XYZ", 11_900_000),
      screenerRow("DEF", 8_400_000),
    ];
    const board = [
      boardRow("XYZ", 1),
      boardRow("ABC", 2),
      boardRow("LMNO", 3),
    ];
    const result = compare({
      screenerRows: screener,
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    });
    expect(result.overlapCount).toBe(2);
    expect(result.overlapSymbols).toEqual(["ABC", "XYZ"]);
    expect(result.screenerOnly).toEqual(["DEF"]);
    expect(result.v22Only).toEqual(["LMNO"]);
  });

  it("completely different Top 3", () => {
    const screener = [
      screenerRow("AAA", 9_000_000),
      screenerRow("BBB", 8_000_000),
      screenerRow("CCC", 7_000_000),
    ];
    const board = [boardRow("XXX", 1), boardRow("YYY", 2), boardRow("ZZZ", 3)];
    const result = compare({
      screenerRows: screener,
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    });
    expect(result.overlapCount).toBe(0);
    expect(result.screenerOnly).toEqual(["AAA", "BBB", "CCC"]);
    expect(result.v22Only).toEqual(["XXX", "YYY", "ZZZ"]);
  });

  it("different ordering of same symbols", () => {
    const screener = [
      screenerRow("ABC", 14_200_000),
      screenerRow("XYZ", 11_900_000),
      screenerRow("DEF", 8_400_000),
    ];
    const board = [
      boardRow("XYZ", 1, { volume: 11_900_000 }),
      boardRow("ABC", 2, { volume: 14_200_000 }),
      boardRow("DEF", 3, { volume: 8_400_000 }),
    ];
    const result = compare({
      screenerRows: screener,
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    });
    expect(result.overlapCount).toBe(3);
    expect(result.orderingDifferences.map((p) => p.symbol).sort()).toEqual(["ABC", "XYZ"]);
    expect(result.orderingDifferences.find((p) => p.symbol === "ABC")).toEqual({
      symbol: "ABC",
      screenerRank: 1,
      v22Rank: 2,
    });
  });

  it("missing values stay unavailable rather than fabricated", () => {
    const screener = [screenerRow("ABC", 1_000_000, { price: null, change_percent: null, provider_as_of: null })];
    const board = [
      boardRow("ABC", 1, {
        acceleration_5m: null,
        session_vwap: null,
        rolling_volume_5s: 0,
      }),
    ];
    const result = compare({
      screenerRows: screener,
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    });
    expect(result.screenerTop3[0]?.price).toBeNull();
    expect(result.screenerTop3[0]?.changePercent).toBeNull();
    expect(result.screenerTop3[0]?.providerTimestamp).toBeNull();
    expect(result.v22Top3[0]?.acceleration5m).toBeNull();
    expect(result.v22Top3[0]?.sessionVwap).toBeNull();
    const text = formatAmRadarShadowReport(result);
    expect(text).toContain("provider_ts=unavailable");
    expect(text).toContain("accel_5m=unavailable");
    expect(text).not.toContain("undefined");
  });

  it("stale timestamp detection for the screener feed", () => {
    const screener = [
      screenerRow("OLD", 5_000_000, { updated_at: "2026-08-26T18:00:00.000Z" }),
    ];
    const result = compare({
      screenerRows: screener,
      v22View: v22View([]),
      v22RawState: v22State([]),
      v22RawRows: [],
    });
    expect(result.screenerStatus).toBe("stale");
    expect(result.freshness.screenerStale).toBe(true);
    expect(result.screenerTop3[0]?.dataAgeMs).toBeGreaterThan(30 * 60_000);
  });

  it("empty screener source", () => {
    const board = [boardRow("XYZ", 1)];
    const result = compare({
      screenerRows: [],
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    });
    expect(result.screenerStatus).toBe("empty");
    expect(result.screenerTop3).toEqual([]);
    expect(result.overlapCount).toBe(0);
    expect(result.v22Top3[0]?.symbol).toBe("XYZ");
  });

  it("null screener query is unavailable", () => {
    const result = compare({
      screenerRows: null,
      v22View: viewRadarV22Generation(null, null, TODAY),
    });
    expect(result.screenerStatus).toBe("unavailable");
    expect(result.v22Status).toBe("unavailable");
  });

  it("empty V2.2 source", () => {
    const screener = [screenerRow("ABC", 4_000_000), screenerRow("DEF", 3_000_000)];
    const result = compare({
      screenerRows: screener,
      v22View: v22View([]),
      v22RawState: v22State([]),
      v22RawRows: [],
    });
    expect(result.v22Status).toBe("empty");
    expect(result.v22Top3).toEqual([]);
    expect(result.overlapCount).toBe(0);
    expect(result.screenerTop3.map((r) => r.symbol)).toEqual(["ABC", "DEF"]);
  });

  it("volume-first comparison: session volume leader vs V2.2 velocity leader", () => {
    const screener = [
      screenerRow("LIQ", 20_000_000),
      screenerRow("THIN", 2_000_000),
      screenerRow("MID", 5_000_000),
    ];
    const board = [
      boardRow("THIN", 1, {
        volume: 2_000_000,
        rolling_volume_60s: 400_000,
        lifecycle: "ACTIVE",
        signal_status: "EXPLOSIVE",
      }),
      boardRow("LIQ", 2, {
        volume: 20_000_000,
        rolling_volume_60s: 80_000,
        lifecycle: "COOLING",
        signal_status: "COOLING",
      }),
      boardRow("MID", 3, { volume: 5_000_000, rolling_volume_60s: 90_000 }),
    ];
    const result = compare({
      screenerRows: screener,
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    });
    expect(result.volume.screenerLeaderSymbol).toBe("LIQ");
    expect(result.volume.v22LeaderSymbol).toBe("THIN");
    expect(result.volume.volumeFirstLeaderMatch).toBe(false);
    expect(result.volume.thinOverLiquid).toBe(true);
  });

  it("V2.2 fresh-volume candidate vs stale cumulative-volume candidate", () => {
    const screener = [
      screenerRow("ABC", 14_200_000),
      screenerRow("DEF", 8_400_000),
      screenerRow("GHI", 6_000_000),
    ];
    const board = [
      boardRow("LMNO", 1, {
        volume: 6_700_000,
        rolling_volume_60s: 1_400_000,
        lifecycle: "ACTIVE",
        signal_status: "EXPLOSIVE",
      }),
      boardRow("ABC", 2, {
        volume: 14_200_000,
        rolling_volume_60s: 180_000,
        lifecycle: "COOLING",
        signal_status: "COOLING",
      }),
      boardRow("XYZ", 3, { volume: 11_900_000, rolling_volume_60s: 920_000 }),
    ];
    const result = compare({
      screenerRows: screener,
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    });
    expect(result.volume.staleCumulativeSymbols).toEqual(["ABC"]);
    expect(result.volume.freshVelocityNotInScreener).toEqual(["LMNO", "XYZ"]);
    expect(result.volume.coolingSymbols).toEqual(["ABC"]);
    expect(result.volume.highActivitySymbols).toContain("LMNO");
  });

  it("session/date mismatch detection (prior session board)", () => {
    const yesterday = [
      boardRow("OLD", 1, { generation_id: GEN }),
    ];
    const state = v22State(yesterday, { session_date: "2026-08-25" });
    const view = viewRadarV22Generation([state], yesterday, TODAY);
    expect(view.valid).toBe(false);
    const result = compare({
      nowMs: NOW_PRE,
      sessionKind: "pre-market",
      screenerRows: [screenerRow("ABC", 1_000_000)],
      v22View: view,
      v22RawState: state,
      v22RawRows: yesterday,
    });
    expect(result.sessionSafety.dateMismatch).toBe(true);
    expect(result.sessionSafety.priorSessionBoard).toBe(true);
    expect(result.v22Status).toBe("unavailable");
    expect(result.v22Top3).toEqual([]);
  });

  it("flags a leftover non-empty board outside regular hours", () => {
    const board = [boardRow("LIVE", 1)];
    const result = compare({
      nowMs: NOW_PRE,
      sessionKind: "pre-market",
      screenerRows: [screenerRow("ABC", 1_000_000)],
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    });
    expect(result.sessionSafety.leftoverBoardOutsideRegular).toBe(true);
    expect(result.sessionSafety.v22EvaluatesThisSession).toBe(false);
  });

  it("does not treat an empty session-reset board as leftover", () => {
    const result = compare({
      nowMs: NOW_PRE,
      sessionKind: "pre-market",
      screenerRows: [screenerRow("ABC", 1_000_000)],
      v22View: v22View([]),
      v22RawState: v22State([]),
      v22RawRows: [],
    });
    expect(result.sessionSafety.leftoverBoardOutsideRegular).toBe(false);
    expect(result.sessionSafety.v22EvaluatesThisSession).toBe(false);
    expect(result.v22Status).toBe("empty");
  });

  it("labels after-hours and weekend evaluations as not V2.2 evaluation windows", () => {
    const board = [boardRow("AH", 1)];
    const ah = compareAmRadarShadow({
      nowMs: NOW_AH,
      screenerRows: [screenerRow("ABC", 1_000_000)],
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    });
    expect(ah.sessionKind).toBe("after-hours");
    expect(ah.sessionSafety.v22EvaluatesThisSession).toBe(false);

    const weekend = compareAmRadarShadow({
      nowMs: NOW_WEEKEND,
      screenerRows: [screenerRow("ABC", 1_000_000)],
      v22View: viewRadarV22Generation(
        [v22State(board, { session_date: "2026-08-29" })],
        board,
        "2026-08-29",
      ),
      v22RawState: v22State(board, { session_date: "2026-08-29" }),
      v22RawRows: board,
    });
    expect(weekend.sessionKind).toBe("closed");
    expect(weekend.sessionSafety.v22EvaluatesThisSession).toBe(false);
  });

  it("materially newer V2.2 timestamps", () => {
    const screener = [
      screenerRow("ABC", 5_000_000, { provider_as_of: "2026-08-26T19:10:00.000Z" }),
    ];
    const board = [
      boardRow("ABC", 1, { provider_as_of: "2026-08-26T19:29:50.000Z" }),
    ];
    const result = compare({
      screenerRows: screener,
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    });
    expect(result.freshness.materiallyNewer).toBe(true);
    expect(result.freshness.v22NewerByMs).toBeGreaterThan(60_000);
  });

  it("drops screener rows that lack a timestamp", () => {
    const selected = selectAmVolumeLeaders(
      [
        screenerRow("KEEP", 2_000_000),
        screenerRow("DROP", 9_000_000, { updated_at: null }),
      ],
      NOW_RTH,
    );
    expect(selected.rows.map((r) => r.symbol)).toEqual(["KEEP"]);
    expect(selected.droppedNoTimestamp).toBe(1);
  });

  it("format output is deterministic and contains no narrative filler", () => {
    const screener = [screenerRow("ABC", 14_200_000), screenerRow("XYZ", 11_900_000)];
    const board = [boardRow("XYZ", 1), boardRow("ABC", 2)];
    const input: ShadowCompareInput = {
      nowMs: NOW_RTH,
      screenerRows: screener,
      v22View: v22View(board),
      v22RawState: v22State(board),
      v22RawRows: board,
    };
    const a = formatAmRadarShadowReport(compareAmRadarShadow(input));
    const b = formatAmRadarShadowReport(compareAmRadarShadow(input));
    expect(a).toBe(b);
    expect(a).toContain("Top-3 overlap: 2/3");
    expect(a).toContain("volume_first_leader_match=false");
    expect(a).not.toMatch(/has substantially|interesting|should replace/i);
  });

  it("hod distance is derived only from price and day high", () => {
    expect(hodDistancePct(9, 10)).toBe(10);
    expect(hodDistancePct(null, 10)).toBeNull();
    expect(hodDistancePct(9, 0)).toBeNull();
  });

  it("does not swap the visible AM Volume Leaders surface onto Radar V2.2", () => {
    const inbox = readFileSync(resolve("src/pages/dashboard/AMInbox.tsx"), "utf8");
    expect(inbox).toContain('title="Volume Leaders · sorted by volume"');
    expect(inbox).toContain("radar-v2-volume-leaders");
    expect(inbox).toContain("useRadarV2VolumeLeaders");
    expect(inbox).not.toContain('title="Day-Trade Radar · sorted by volume"');
    expect(inbox).toContain("Not Radar V2.2");
    expect(inbox).not.toMatch(/from ["']@\/lib\/radar-v22["']/);
    expect(inbox).not.toMatch(/radar_v22_board/);
    expect(inbox).not.toMatch(/useRadarV22Board/);
    const leaders = readFileSync(resolve("src/components/action-center/VolumeLeaders.tsx"), "utf8");
    expect(leaders).toContain("Screener leaders · sorted by volume");
    expect(leaders).not.toContain("Day-Trade Radar · sorted by volume");
    const tabs = readFileSync(resolve("src/config/screener-tabs.config.ts"), "utf8");
    expect(tabs).toContain('label: "Day Trade Radar"');
  });
});
