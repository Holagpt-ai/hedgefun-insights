import { describe, expect, it } from "vitest";
import { buildPmSessionSummaryRows, type PmRadarBoardContext } from "@/lib/inbox/pm-session-summary";

const APPLICABLE = "2026-03-16";
const NOW = Date.parse("2026-03-16T20:30:00.000Z");

function board(): PmRadarBoardContext {
  return {
    nowMs: NOW,
    applicableTradingDate: APPLICABLE,
    consumerEtDate: APPLICABLE,
    isTradingDay: true,
    boardState: "ready",
    statusMessage: null,
    sessionKind: "market",
    generationId: "gen",
    preservedNotLive: false,
    priorSessionEvidence: false,
  };
}

describe("buildPmSessionSummaryRows", () => {
  it("keeps late-session scanner events in rank order up to the limit", () => {
    const rows = buildPmSessionSummaryRows(
      [
        {
          symbol: "AAA",
          rank: 1,
          volume: 1_000_000,
          primary_scanner_event: "RUNNING_UP",
          primary_scanner_event_at: "2026-03-16T20:00:00.000Z",
          radar_trading_date: APPLICABLE,
          rvol_5m: 2.1,
        },
        {
          symbol: "BBB",
          rank: 2,
          volume: 900_000,
          primary_scanner_event: "HOD_BREAK",
          primary_scanner_event_at: "2026-03-16T20:05:00.000Z",
          radar_trading_date: APPLICABLE,
          rvol_5m: 3,
        },
        {
          symbol: "CCC",
          rank: 3,
          volume: 800_000,
          primary_scanner_event: "LATE_DAY_ACCELERATION",
          primary_scanner_event_at: "2026-03-16T20:10:00.000Z",
          radar_trading_date: APPLICABLE,
        },
        { symbol: "DDD", rank: 4, volume: 1, primary_scanner_event: null, radar_trading_date: APPLICABLE },
        {
          symbol: "EEE",
          rank: 5,
          volume: 1,
          primary_scanner_event: "OTHER_EVENT",
          primary_scanner_event_at: "2026-03-16T20:00:00.000Z",
          radar_trading_date: APPLICABLE,
        },
      ],
      board(),
      2,
    );
    expect(rows.map((r) => r.symbol)).toEqual(["AAA", "BBB"]);
    expect(rows[0]?.freshness).toBe("late_confirmed");
    expect(rows[1]?.primaryEventLabel).toContain("HOD");
  });

  it("returns empty when no qualifying scanner events exist", () => {
    expect(
      buildPmSessionSummaryRows(
        [
          {
            symbol: "ZZZ",
            rank: 1,
            volume: 1,
            primary_scanner_event: "VOLUME_SPIKE",
            radar_trading_date: APPLICABLE,
          },
        ],
        board(),
      ),
    ).toEqual([]);
  });
});
