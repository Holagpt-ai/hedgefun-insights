import { describe, expect, it } from "vitest";
import { buildMorningOpportunityBoard } from "@/lib/am-inbox/morning-opportunity-board";
import {
  evaluateMorningRadarEligibility,
  resolveMorningOpportunityEmptyMessage,
} from "@/lib/am-inbox/morning-opportunity-eligibility";
import type { MorningRadarRow } from "@/lib/am-inbox/morning-opportunity-types";
import {
  compareCrossSurfacePrices,
  resolveDisplayPriceEvidence,
  shouldApplyDonorPriceField,
} from "@/lib/market-data/display-price-evidence";
import { buildRadarTriggerDisplayTitle } from "@/lib/scanner-intelligence/radar-trigger-evidence-title";
import { buildParticipationTriggerEvidence } from "@/lib/scanner-intelligence/participation-trigger-evidence";
import { compareEventUrgency } from "@/lib/scanner-intelligence/event-urgency";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";

function radar(partial: Partial<MorningRadarRow> & Pick<MorningRadarRow, "symbol" | "volume">): MorningRadarRow {
  return {
    price: 6,
    primary_scanner_event: null,
    primary_scanner_event_at: null,
    scanner_events: [],
    rvol_5m: null,
    vol_velocity: null,
    volume_acceleration_pct: null,
    gap_percent: null,
    change_percent: null,
    ...partial,
  };
}

describe("Batch 09 — Morning Opportunity qualification", () => {
  it("explains high-volume rejection when only volume qualifies", () => {
    const result = evaluateMorningRadarEligibility(
      radar({ symbol: "VOLY", volume: 3_000_000, change_percent: 0.5 }),
      true,
    );
    expect(result.accepted).toBe(false);
    expect(result.path).toBe("volume_only");
    expect(result.rejectionCodes).toContain("VOLUME_ONLY_NO_EVENT");
  });

  it("accepts genuine premarket participation when RVOL arrives", () => {
    const without = evaluateMorningRadarEligibility(
      radar({ symbol: "WAIT", volume: 2_000_000, change_percent: 3, rvol_5m: null }),
      true,
    );
    expect(without.accepted).toBe(false);
    expect(without.rejectionCodes).toContain("MISSING_RVOL_PARTICIPATION");

    const withRvol = evaluateMorningRadarEligibility(
      radar({ symbol: "WAIT", volume: 2_000_000, change_percent: 3, rvol_5m: 1.4 }),
      true,
    );
    expect(withRvol.accepted).toBe(true);
    expect(withRvol.section).toBe("premarket_continuation");
  });

  it("uses honest empty messaging for missing RVOL vs stale generation", () => {
    const missingRvol = resolveMorningOpportunityEmptyMessage({
      radarRows: [radar({ symbol: "A", volume: 2_000_000, change_percent: 2 })],
      radarStatus: "available",
      polygonPremarketActive: true,
    });
    expect(missingRvol).toMatch(/RVOL/i);

    const stale = resolveMorningOpportunityEmptyMessage({
      radarRows: [],
      generationStale: true,
      radarTrust: "STALE",
    });
    expect(stale).toMatch(/stale/i);
  });

  it("preserves liquidity-first ranking on the board", () => {
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
          volume: 200_000,
          primary_scanner_event: "VOLUME_EXPLOSION",
          scanner_events: [{ type: "VOLUME_EXPLOSION", active: true }],
        }),
      ],
      polygonPremarketActive: true,
      radarStatus: "available",
    });
    expect(board.sections[0]?.cards[0]?.symbol).toBe("LIQ");
    expect(
      compareEventUrgency(
        { symbol: "LIQ", volume: 6_000_000, events: ["RUNNING_UP"], catalystPresent: null, continuationUrgency: 0 },
        { symbol: "THIN", volume: 200_000, events: ["VOLUME_EXPLOSION"], catalystPresent: null, continuationUrgency: 0 },
      ),
    ).toBeLessThan(0);
  });
});

describe("Batch 09 — cross-surface price evidence", () => {
  it("labels two valid prices with different timestamps as legitimately different", () => {
    const cmp = compareCrossSurfacePrices({
      primary: {
        price: 0.99,
        providerAsOf: "2026-10-14T08:00:00.000Z",
        sourceLabel: "Day Trade Radar",
        sessionLabel: "pre-market",
      },
      alternate: {
        price: 1.09,
        providerAsOf: "2026-10-14T08:15:00.000Z",
        sourceLabel: "Volume Leaders",
        sessionLabel: "pre-market",
      },
      nowMs: Date.parse("2026-10-14T08:20:00.000Z"),
    });
    expect(cmp.legitimatelyDifferent).toBe(true);
    expect(cmp.summary).toMatch(/Different snapshots/i);
    expect(cmp.primary.trustLine).toMatch(/Delayed|Fresh|Stale/i);
  });

  it("uses provenance-only price note when market feed tier is unknown", () => {
    const resolved = resolveDisplayPriceEvidence({
      observation: {
        price: 1.09,
        providerAsOf: "2026-10-14T08:15:00.000Z",
        sourceLabel: "Screener · gappers",
      },
      nowMs: Date.parse("2026-10-14T08:20:00.000Z"),
    });
    expect(resolved.note).toMatch(/snapshot provenance/i);
    expect(resolved.note).toMatch(/as of/i);
  });

  it("blocks stale donor price from overriding newer sentinel quote", () => {
    const apply = shouldApplyDonorPriceField(
      { symbol: "TGL", provider_as_of: "2026-10-14T09:00:00.000Z", price: 1.09 },
      { symbol: "TGL", provider_as_of: "2026-10-14T08:00:00.000Z", price: 0.99 },
    );
    expect(apply).toBe(false);
  });
});

describe("Batch 09 — participation vs historical trigger", () => {
  it("does not describe stale SURGING metrics as currently active", () => {
    const nowMs = Date.parse("2026-10-14T12:00:00.000Z");
    const evidence = buildParticipationTriggerEvidence(
      {
        symbol: "OLD",
        primary_scanner_event: "RUNNING_UP",
        primary_scanner_event_at: "2026-10-14T11:30:00.000Z",
        provider_as_of: "2026-10-14T08:00:00.000Z",
        participation_state: "SURGING",
        volume_acceleration_pct: 80,
      } as RadarRankedRow,
      nowMs,
    );
    expect(evidence.headline).toMatch(/Last observed SURGING/i);
    expect(evidence.headline).not.toMatch(/SURGING now/i);
    expect(evidence.headline).not.toMatch(/currently/i);
  });

  it("separates historical SURGING trigger from current COOLING participation", () => {
    const nowMs = Date.parse("2026-10-14T10:00:00.000Z");
    const row = {
      symbol: "COOL",
      primary_scanner_event: "VOLUME_ACCELERATION",
      primary_scanner_event_at: "2026-10-14T08:00:00.000Z",
      provider_as_of: "2026-10-14T09:30:00.000Z",
      volume_acceleration_pct: -25,
      participation_state: "COOLING",
      vol_velocity: 1_000,
    } as RadarRankedRow;
    const evidence = buildParticipationTriggerEvidence(row, nowMs);
    expect(evidence.participationLabel).toBe("COOLING");
    expect(evidence.participationSupported).toBe(false);
    expect(evidence.headline).toMatch(/Historical/i);
    expect(evidence.headline).toMatch(/Last observed COOLING/i);
    expect(evidence.headline).not.toMatch(/\bnow\b/i);
    expect(evidence.headline).not.toMatch(/currently/i);
    expect(evidence.triggerAt).toBeTruthy();
  });
});

describe("Batch 09 — radar trigger display title", () => {
  it("keeps promotion reason and participation evidence in one factual title", () => {
    const nowMs = Date.parse("2026-10-14T12:00:00.000Z");
    const { title } = buildRadarTriggerDisplayTitle({
      row: {
        symbol: "PROMO",
        promoted_at: "2026-10-14T11:00:00.000Z",
        primary_scanner_event: "VOLUME_EXPLOSION",
        primary_scanner_event_at: "2026-10-14T08:00:00.000Z",
        provider_as_of: "2026-10-14T08:05:00.000Z",
        participation_state: "COOLING",
        promotion_reason: {
          version: "v1",
          primaryEvent: { type: "VOLUME_EXPLOSION", eventAt: "2026-10-14T08:00:00.000Z" },
          supportingEvents: [],
          triggerTimestamp: null,
        },
      } as RadarRankedRow,
      nowMs,
    });
    expect(title).toMatch(/Promotion: VOLUME EXPLOSION/);
    expect(title).toMatch(/Historical/i);
    expect(title).toMatch(/Last observed COOLING/i);
  });
});
