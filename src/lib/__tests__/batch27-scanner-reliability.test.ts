import { describe, expect, it } from "vitest";
import {
  resolveSessionGapPercent,
  sessionGapEligible,
  sessionUpGapContinuationEligible,
} from "@/lib/daily-intelligence/session-gap-evidence";
import { evaluateMorningRadarEligibility } from "@/lib/am-inbox/morning-opportunity-eligibility";
import type { MorningRadarRow } from "@/lib/am-inbox/morning-opportunity-types";
import { moverFromPolygonTicker, toMoverListRow } from "@/lib/markets/movers-integrity";
import { selectMarketPulseItems } from "@/lib/markets/market-pulse-select";
import { summarizeMoversListProvenance } from "@/lib/markets/movers-provenance";
import { formatDayTradeRadarStatusSuffix } from "@/features/day-trade-radar-v2/day-trade-radar-opportunity";

describe("Batch 27 — scanner reliability & provenance", () => {
  it("Gap Continuation requires an up-gap, not a down-gap continuation label", () => {
    expect(sessionGapEligible({ change_percent: -8 }, 4)).toBe(true);
    expect(sessionUpGapContinuationEligible({ change_percent: -8 }, 4)).toBe(false);
    expect(sessionUpGapContinuationEligible({ gap_percent: 6 }, 4)).toBe(true);
    expect(resolveSessionGapPercent({ gap_percent: -6, change_percent: 2 })).toBe(-6);
  });

  it("Morning Opportunity rejects negative-gap names from Gap Continuation", () => {
    const row: MorningRadarRow = {
      symbol: "SDST",
      volume: 2_000_000,
      change_percent: -5,
      gap_percent: -5,
      scanner_events: [{ type: "GAP_CONTINUATION", active: true }],
    };
    const result = evaluateMorningRadarEligibility(row, true);
    expect(result.accepted).toBe(false);
    expect(result.section).not.toBe("gap_continuation");
  });

  it("canonical movers treat zero volume as missing, not verified zero", () => {
    const nowMs = Date.parse("2026-08-27T16:00:00.000Z");
    const mover = moverFromPolygonTicker(
      {
        ticker: "NWGL",
        name: "NWGL",
        todaysChangePerc: 126,
        day: { c: 0.27, v: 0, t: nowMs },
        prevDay: { c: 0.12 },
        lastTrade: { p: 0.27, t: nowMs },
        min: { c: 0.27, t: nowMs },
      },
      "regular",
      nowMs,
    );
    expect(mover.valid).toBe(true);
    expect(mover.volume).toBeNull();
    const listRow = toMoverListRow(mover);
    expect(listRow?.volume).toBeNull();
  });

  it("Market Pulse does not treat zero-volume as verified session liquidity", () => {
    const nowMs = Date.parse("2026-08-27T16:00:00.000Z");
    const mover = moverFromPolygonTicker(
      {
        ticker: "WORX",
        name: "WORX",
        todaysChangePerc: 44,
        day: { c: 3.86, v: 0, t: nowMs },
        prevDay: { c: 2.68 },
        lastTrade: { p: 3.86, t: nowMs },
        min: { c: 3.86, t: nowMs },
      },
      "regular",
      nowMs,
    );
    expect(mover.volume).toBeNull();
    const provenance = summarizeMoversListProvenance([mover], {
      nowMs,
      universe: "tracked_gainers_losers",
      moverSession: "regular",
    });
    const items = selectMarketPulseItems({
      gainers: [mover],
      losers: [],
      provenance,
      nowMs,
    });
    expect(items[0]?.volume).toBeNull();
  });

  it("status rail distinguishes on-desk vs qualified monitoring counts", () => {
    expect(
      formatDayTradeRadarStatusSuffix({
        candidateUniverseCount: 30,
        topOpportunityCount: 1,
        funnel: {
          detectedCount: 30,
          qualifiedCount: 1,
          priorityCount: 1,
          displayedCount: 1,
          rejectionSummary: {},
        },
        qualifiedMonitoringCount: 0,
      }),
    ).toBe("30 detected · 1 Five Pillars passed · 1 on desk");
    expect(
      formatDayTradeRadarStatusSuffix({
        candidateUniverseCount: 30,
        topOpportunityCount: 1,
        qualifiedMonitoringCount: 2,
        funnel: {
          detectedCount: 30,
          qualifiedCount: 3,
          priorityCount: 1,
          displayedCount: 1,
          rejectionSummary: {},
        },
      }),
    ).toContain("2 qualified monitoring");
  });
});
