import { describe, expect, it } from "vitest";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import { buildMorningOpportunityBoard } from "@/lib/am-inbox/morning-opportunity-board";
import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import type { MorningRadarRow } from "@/lib/am-inbox/morning-opportunity-board";

function handoff(
  symbol: string,
  category: "DAY_TWO_WATCH" | "POWER_HOUR_MOMENTUM",
  volume: number,
  amSessionDate: string,
): AmInboxLateSessionCandidate {
  const context = buildLateSessionContinuationContext({
    symbol,
    sourceSessionDate: "2026-09-28",
    sourceTimestamp: "2026-09-28T20:00:00.000Z",
    sourceCategory: category,
    amSessionDate,
    volume,
    dollarVolume: volume * 5,
    rvol: 2,
    lastPrice: 5,
    catalystPresent: false,
  });
  return { context, workflow: null, sourceCategories: [category] };
}

function radar(partial: Partial<MorningRadarRow> & Pick<MorningRadarRow, "symbol" | "volume">): MorningRadarRow {
  return {
    price: 6,
    primary_scanner_event: null,
    primary_scanner_event_at: "2026-09-29T13:00:00.000Z",
    scanner_events: [],
    rvol_5m: null,
    vol_velocity: null,
    volume_acceleration_pct: null,
    gap_percent: null,
    ...partial,
  };
}

describe("morning opportunity board", () => {
  it("returns no fabricated rows when nothing qualifies", () => {
    const board = buildMorningOpportunityBoard({
      radarRows: [radar({ symbol: "QUIET", volume: 2_000_000 })],
      radarSession: "pre-market",
      radarStatus: "available",
      continuation: [],
    });
    expect(board.sections).toEqual([]);
    expect(board.emptyMessage).toBe("No qualifying movers yet");
  });

  it("groups real momentum, gap, and day-two names and omits empty sections", () => {
    const board = buildMorningOpportunityBoard({
      radarRows: [
        radar({
          symbol: "RUN",
          volume: 4_000_000,
          primary_scanner_event: "RUNNING_UP",
          scanner_events: [{ type: "RUNNING_UP", active: true }],
          rvol_5m: 3,
        }),
        radar({
          symbol: "GAP",
          volume: 1_500_000,
          primary_scanner_event: "GAP_CONTINUATION",
          scanner_events: [{ type: "GAP_CONTINUATION", active: true }],
          gap_percent: 8,
        }),
      ],
      radarSession: "pre-market",
      radarStatus: "available",
      continuation: [handoff("DAY2", "DAY_TWO_WATCH", 900_000, "2026-09-29")],
      nowMs: Date.parse("2026-09-29T12:00:00.000Z"),
    });
    const ids = board.sections.map((section) => section.id);
    expect(ids).toEqual(["top_momentum", "gap_continuation", "day_two_watch"]);
    expect(ids).not.toContain("premarket_continuation");
    expect(board.sections.flatMap((section) => section.cards).map((card) => card.symbol)).toEqual([
      "RUN",
      "GAP",
      "DAY2",
    ]);
    expect(board.sections[2]?.cards[0]?.trust).toBe("DELAYED");
    expect(board.sections[2]?.cards[0]?.catalystStatus).toBe("none");
    expect(board.sections[0]?.cards[0]?.rvol5m).toBe(3);
  });

  it("does not promote a thin explosion over a liquid name", () => {
    const board = buildMorningOpportunityBoard({
      radarRows: [
        radar({
          symbol: "LIQ",
          volume: 6_000_000,
          primary_scanner_event: "RUNNING_UP",
          scanner_events: [{ type: "RUNNING_UP", active: true }],
        }),
        radar({
          symbol: "THIN",
          volume: 150_000,
          primary_scanner_event: "VOLUME_EXPLOSION",
          scanner_events: [{ type: "VOLUME_EXPLOSION", active: true }, { type: "RUNNING_UP", active: true }],
        }),
      ],
      radarSession: "market",
      radarStatus: "available",
    });
    const symbols = board.sections.flatMap((section) => section.cards).map((card) => card.symbol);
    expect(symbols[0]).toBe("LIQ");
  });

  it("drops an expired continuation handoff", () => {
    const board = buildMorningOpportunityBoard({
      continuation: [handoff("OLD", "DAY_TWO_WATCH", 2_000_000, "2026-10-05")],
      nowMs: Date.parse("2026-10-05T12:00:00.000Z"),
    });
    expect(board.emptyMessage).toBe("No qualifying movers yet");
  });

  it("keeps unknown price and rvol null", () => {
    const board = buildMorningOpportunityBoard({
      continuation: [handoff("DAY2", "POWER_HOUR_MOMENTUM", 2_000_000, "2026-09-29")],
    });
    const card = board.sections[0]?.cards[0];
    expect(card?.section).toBe("premarket_continuation");
    expect(card?.gapPercent).toBeNull();
    expect(card?.vwapSide).toBeNull();
    expect(card?.eventType).toBeNull();
  });
});
