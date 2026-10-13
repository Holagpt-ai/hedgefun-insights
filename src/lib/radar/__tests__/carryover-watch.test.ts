import { describe, expect, it } from "vitest";
import { lastCompletedUsTradingSession } from "@/lib/radar/carryover-session";
import { assembleCarryoverWatch } from "@/lib/radar/carryover-watch";
import {
  restoreExtendedSessionGappers,
  shouldRestoreGappersFromRadar,
} from "@/lib/screeners/radar-gapper-restoration";
import { isActionableScannerQuote } from "@/lib/screeners/scanner-tab-qualification";
import {
  isPremarketOpenMarketStamp,
  scannerTimeEvidenceTitle,
} from "@/lib/screeners/screener-trigger-time";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import { formatQualificationPhaseLabel } from "@/lib/day-trade/build-qualified-panel-rows";
import type { DayTradeQualificationStateRow } from "@/lib/day-trade/qualification-lifecycle-client";

describe("last completed US session", () => {
  it("uses the prior trading day during the 4 AM premarket open", () => {
    const session = lastCompletedUsTradingSession(new Date("2026-10-14T08:00:01.000Z"));
    expect(session.sessionDate).toBe("2026-10-13");
  });

  it("keeps Monday's session after 8 PM ET and not during the same day's premarket", () => {
    expect(lastCompletedUsTradingSession(new Date("2026-10-13T12:00:00.000Z")).sessionDate).toBe("2026-10-12");
    expect(lastCompletedUsTradingSession(new Date("2026-10-14T01:00:00.000Z")).sessionDate).toBe("2026-10-13");
  });

  it("walks weekends and holidays back to the last trading session", () => {
    expect(lastCompletedUsTradingSession(new Date("2026-10-17T16:00:00.000Z")).sessionDate).toBe("2026-10-16");
    expect(lastCompletedUsTradingSession(new Date("2026-09-07T16:00:00.000Z")).sessionDate).toBe("2026-09-04");
    expect(lastCompletedUsTradingSession(new Date("2026-10-12T07:00:00.000Z")).sessionDate).toBe("2026-10-09");
  });
});

describe("carryover watch assembly", () => {
  it("sorts by prior-session volume and keeps the stored pillar result", () => {
    const view = assembleCarryoverWatch({
      sessionDate: "2026-10-13",
      sessionLabel: "Mon, Oct 13",
      carryoverRows: [
        {
          symbol: "THIN",
          last_price: 4,
          session_volume: 100_000,
          previous_close: 3,
          volume_velocity: 1_000,
          session_kind: "market",
          scanner_events: [{ type: "RUNNING_UP" }],
        },
        {
          symbol: "HEAVY",
          last_price: 6,
          session_volume: 8_000_000,
          previous_close: 5,
          volume_velocity: 40_000,
          session_kind: "after-hours",
          primary_scanner_event: "LATE_DAY_ACCELERATION",
          distance_from_hod_pct: 1.2,
        },
        {
          symbol: "ZERO",
          last_price: 0,
          session_volume: 0,
        },
      ],
      carryoverError: null,
      closedRows: null,
      closedError: null,
      pillars: [
        {
          symbol: "HEAVY",
          pillar_phase: "EXPIRED",
          five_pillars_pass: false,
          pillar_outcomes: { price: "pass", move: "fail", float: "unavailable", participation: "pass", freshness: "pass" },
          first_qualified_at: "2026-10-13T14:00:00.000Z",
          provider_as_of: "2026-10-13T19:30:00.000Z",
          ever_on_desk: true,
        },
      ],
      pillarError: null,
    });

    expect(view.status).toBe("ready");
    expect(view.candidates.map((row) => row.symbol)).toEqual(["HEAVY", "THIN"]);
    expect(view.withheldInvalidQuotes).toBe(1);
    expect(view.candidates[0]?.classification).toBe("previously_qualified");
    expect(view.candidates[0]?.pillarLines.join(" ")).toContain("move: fail");
    expect(view.candidates[0]?.sessionEvidence).toContain("After-hours");
    expect(view.candidates[0]?.sessionEvidence).toContain("power-hour");
    expect(view.candidates[1]?.classification).toBe("momentum_only");
    expect(view.historicalNotice).toMatch(/does not qualify the current session/);
    expect(view.candidates[0]?.handoffs.actionCenter).toContain("/dashboard/action-center");
  });

  it("does not invent names when both historical sources are missing", () => {
    const view = assembleCarryoverWatch({
      sessionDate: "2026-10-13",
      sessionLabel: "Mon, Oct 13",
      carryoverRows: [],
      carryoverError: "relation does not exist",
      closedRows: [],
      closedError: "permission denied",
      pillars: null,
      pillarError: null,
    });
    expect(view.status).toBe("unavailable");
    expect(view.unavailableReason).toContain("radar_v22_carryover_snapshot");
    expect(view.candidates).toEqual([]);
  });
});

describe("extended-session gap restoration", () => {
  const row = (partial: Partial<ScreenerResultRow>): ScreenerResultRow =>
    ({
      tab_id: "day_trade_radar",
      symbol: "AAA",
      company_name: null,
      price: 3,
      change_percent: 50,
      volume: 2_000_000,
      avg_volume: null,
      rvol: null,
      float_shares: null,
      gap_percent: null,
      high_52w: null,
      low_52w: null,
      range_event: null,
      market_cap: null,
      prior_session_volume: null,
      volume_ratio_prior_session: null,
      avg_volume_20d: null,
      rvol_20d: null,
      day_high: null,
      day_low: null,
      provider_as_of: "2026-10-14T08:10:00.000Z",
      sync_run_id: "run",
      updated_at: "2026-10-14T08:10:00.000Z",
      ...partial,
    }) as ScreenerResultRow;

  it("restores a premarket gap from the verified move and leaves regular session alone", () => {
    const restored = restoreExtendedSessionGappers({
      session: "pre-market",
      radarRows: [row({ symbol: "ZZX", change_percent: 50 }), row({ symbol: "FLAT", change_percent: 1, volume: 9_000_000 })],
    });
    expect(restored?.rows.map((item) => item.symbol)).toEqual(["ZZX"]);
    expect(restored?.rows[0]?.gap_percent).toBe(50);
    expect(restoreExtendedSessionGappers({
      session: "market",
      radarRows: [row({ change_percent: 50 })],
    })).toBeNull();
  });

  it("does not replace an already evaluated gapper generation", () => {
    expect(shouldRestoreGappersFromRadar({
      status: "empty",
      rows: [],
      tab_evaluation_evidence: {
        gappers: {
          status: "evaluated",
          universe_count: 2,
          volume_positive_count: 2,
          gap_calculable_count: 2,
          qualified_count: 0,
          selected_count: 0,
        },
      },
    })).toBe(false);
  });
});

describe("scanner integrity labels", () => {
  it("rejects zero price and zero volume quotes", () => {
    expect(isActionableScannerQuote(0, 1_000)).toBe(false);
    expect(isActionableScannerQuote(4, 0)).toBe(false);
    expect(isActionableScannerQuote(4, 1_000)).toBe(true);
  });

  it("labels a 4:00:01 ET stamp as a market-event open, not detection latency", () => {
    expect(isPremarketOpenMarketStamp("2026-10-14T08:00:01.000Z")).toBe(true);
    const title = scannerTimeEvidenceTitle({
      marketEventAt: "2026-10-14T08:00:01.000Z",
      publishedAt: "2026-10-14T08:20:00.000Z",
    });
    expect(title).toContain("Market-event time");
    expect(title).toContain("premarket open");
    expect(title).toContain("not inferred");
    expect(title).not.toMatch(/latency of/);
  });

  it("shows a human qualification phase instead of an ISO timestamp", () => {
    const label = formatQualificationPhaseLabel({
      pillar_phase: "GRACE",
      pillar_expired_at: null,
      five_pillars_pass: false,
      last_desk_departure_reason: "PILLARS_IN_GRACE",
    } as DayTradeQualificationStateRow);
    expect(label).toBe("Five Pillars under review");
    expect(label).not.toContain("T");
  });
});
