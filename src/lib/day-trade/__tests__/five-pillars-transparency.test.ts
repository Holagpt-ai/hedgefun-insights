import { describe, expect, it } from "vitest";
import type { DayTradeQualificationStateRow } from "@/lib/day-trade/qualification-lifecycle-client";
import { buildFivePillarsTransparencyView } from "@/lib/day-trade/five-pillars-transparency";
import { evaluateDayTradeQualification } from "@/features/day-trade-radar-v2/day-trade-qualification";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";

const NOW = Date.parse("2026-09-16T15:00:00.000Z");

function baseRow(overrides: Partial<RadarRankedRow> = {}): RadarRankedRow {
  return {
    symbol: "AAA",
    company_name: "AAA Inc",
    price: 5,
    change_percent: 12,
    float_shares: 4_000_000,
    volume_ratio_prior_session: 6,
    prior_session_volume: 500_000,
    rvol_5m: 7,
    volume: 2_000_000,
    provider_as_of: "2026-09-16T14:55:00.000Z",
    primary_scanner_event_at: "2026-09-16T14:50:00.000Z",
    rank: 1,
    access_rank: 1,
    ...overrides,
  } as RadarRankedRow;
}

function persisted(overrides: Partial<DayTradeQualificationStateRow> = {}): DayTradeQualificationStateRow {
  return {
    symbol: "AAA",
    session_date: "2026-09-16",
    pillar_phase: "ACTIVE",
    five_pillars_pass: true,
    ever_on_desk: true,
    currently_on_desk: false,
    monitoring_eligible: true,
    first_qualified_at: "2026-09-16T10:00:00.000Z",
    first_desk_at: "2026-09-16T10:05:00.000Z",
    last_desk_departure_at: "2026-09-16T13:00:00.000Z",
    last_desk_departure_reason: "TOP10_DISPLACED",
    provider_as_of: "2026-09-16T13:00:00.000Z",
    pillar_outcomes: null,
    pillar_expired_at: null,
    monitoring_data_status: "LIVE",
    ...overrides,
  } as DayTradeQualificationStateRow;
}

describe("five pillars transparency", () => {
  it("marks all pillars PASS for a fully qualified desk candidate", () => {
    const row = baseRow();
    const view = buildFivePillarsTransparencyView({
      row,
      nowMs: NOW,
      onAuthoritativeDesk: true,
    });
    expect(view.momentumPass).toBe(true);
    expect(view.freshnessPass).toBe(true);
    expect(view.pillars.every((p) => p.status === "PASS")).toBe(true);
    expect(view.lifecycle).toBe("on_desk");
  });

  it("shows MISSING participation when no RVOL signals exist", () => {
    const row = baseRow({
      volume_ratio_prior_session: null,
      prior_session_volume: null,
      rvol_5m: null,
      time_adjusted_rvol: null,
      avg_volume_20d: null,
    });
    const view = buildFivePillarsTransparencyView({ row, nowMs: NOW });
    const participation = view.pillars.find((p) => p.key === "participation");
    expect(participation?.status).toBe("MISSING");
    expect(view.lifecycle).toBe("awaiting_evidence");
  });

  it("uses GRACE on failing pillars when persisted phase is GRACE", () => {
    const row = baseRow({ change_percent: 4 });
    const view = buildFivePillarsTransparencyView({
      row,
      nowMs: NOW,
      persisted: persisted({ pillar_phase: "GRACE", five_pillars_pass: false }),
    });
    const move = view.pillars.find((p) => p.key === "move");
    expect(move?.status).toBe("GRACE");
    expect(view.lifecycle).toBe("monitoring");
  });

  it("never presents an expired qualification as on-desk current pass", () => {
    const row = baseRow();
    const view = buildFivePillarsTransparencyView({
      row,
      nowMs: NOW,
      onAuthoritativeDesk: false,
      persisted: persisted({
        pillar_phase: "EXPIRED",
        five_pillars_pass: false,
        pillar_expired_at: "2026-09-16T12:00:00.000Z",
        monitoring_eligible: false,
      }),
    });
    expect(view.lifecycle).toBe("expired");
    expect(view.compactSummary).toMatch(/prior stored pass|expired/i);
    expect(view.lifecycleTitle).not.toMatch(/Currently qualified/i);
  });

  it("aligns momentum rejection with day-trade qualification funnel", () => {
    const row = baseRow({ change_percent: 2 });
    const funnel = evaluateDayTradeQualification(row, NOW);
    const view = buildFivePillarsTransparencyView({ row, nowMs: NOW });
    expect(view.momentumPass).toBe(false);
    expect(funnel.qualified).toBe(false);
    expect(view.pillars.find((p) => p.key === "move")?.status).toBe("FAIL");
  });

  it("reuses scanner provider_as_of for pillar observation timestamps", () => {
    const row = baseRow({ provider_as_of: "2026-09-16T14:55:00.000Z" });
    const view = buildFivePillarsTransparencyView({ row, nowMs: NOW });
    expect(view.providerAsOf).toBe("2026-09-16T14:55:00.000Z");
    expect(view.pillars[0]?.observationAt).toBe("2026-09-16T14:55:00.000Z");
  });
});
