import { describe, expect, it } from "vitest";
import { mapPersistedLateSessionRow } from "@/lib/am-inbox/late-session-handoff-persistence";
import {
  buildContinuationCapturedRvolDisplay,
  continuationRvolMetricLabel,
} from "@/lib/am-inbox/continuation-rvol-display";
import { continuationRankingRvolFromContext } from "@/lib/am-inbox/continuation-rvol-ranking";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import {
  collapseLateSessionCandidates,
  continuationCandidateIdentityKey,
  mergeLateSessionCandidateEntries,
} from "@/lib/am-inbox/late-session-candidate-collapse";
import {
  buildAmInboxLateSessionViewFromContexts,
  buildLateSessionContinuationFunnel,
} from "@/lib/am-inbox/am-inbox-late-session-view";
import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import {
  computeValidThroughSessionDate,
  resolveLateSessionExpiryState,
} from "@/lib/am-inbox/late-session-expiry";
import { nextTradingDay } from "@/lib/market-calendar";
import { rankingRvolFromRaw } from "@/lib/screeners/rvol-confidence";
import { compareAmInboxLateSessionCandidates } from "@/lib/am-inbox/am-inbox-late-session-priority";
import type { SecurityId } from "@/types/security-identity";

const SEC_A = "11111111-1111-4111-8111-111111111111" as SecurityId;
const SEC_B = "22222222-2222-4222-8222-222222222222" as SecurityId;

function candidate(
  overrides: Partial<AmInboxLateSessionCandidate["context"]> & {
    sourceCategories?: AmInboxLateSessionCandidate["sourceCategories"];
  },
): AmInboxLateSessionCandidate {
  const {
    sourceCategories,
    ...ctxOverrides
  } = overrides;
  const context = buildLateSessionContinuationContext({
    symbol: "AAA",
    sourceSessionDate: "2026-09-21",
    sourceTimestamp: "2026-09-21T20:00:00.000Z",
    sourceCategory: "POWER_HOUR_MOMENTUM",
    volume: 5_000_000,
    rvol: 4,
    rvolMetricKind: "rvol_20d",
    rvolBaselineVolume: 500_000,
    dollarVolume: 50_000_000,
    ...ctxOverrides,
  });
  return {
    context,
    workflow: null,
    sourceCategories: sourceCategories ?? [context.sourceCategory],
  };
}

describe("Batch 12 — RVOL provenance display", () => {
  it("never labels untyped persisted RVOL as 5m", () => {
    const ctx = mapPersistedLateSessionRow(
      {
        id: "1",
        security_id: null,
        symbol: "AAA",
        source_session_date: "2026-09-21",
        source_timestamp: "2026-09-21T20:00:00.000Z",
        source_category: "POWER_HOUR_MOMENTUM",
        last_price: 10,
        session_move_pct: 5,
        volume: 1_000_000,
        rvol: 3.5,
        dollar_volume: 10_000_000,
        close_distance_from_hod_pct: 1,
        after_hours_extends: null,
        catalyst_present: null,
        float_turnover: null,
        historical_context_available: false,
        evidence_labels: [],
        sample_size_quality: null,
        comparable_episode_count: 0,
        most_recent_comparable_date: null,
        profile_freshness: "UNKNOWN",
        valid_from_session_date: "2026-09-22",
        valid_through_session_date: "2026-09-22",
        capture_freshness_class: null,
      },
      "2026-09-22",
    );
    expect(ctx.rvolMetricKind).toBeNull();
    expect(continuationRvolMetricLabel(ctx.rvolMetricKind)).toBe("RVOL (window unverified)");
    expect(buildContinuationCapturedRvolDisplay(ctx).line).toMatch(/window unverified.*3\.50/);
  });

  it("labels verified metric kinds correctly", () => {
    expect(continuationRvolMetricLabel("rvol_5m")).toBe("5m RVOL");
    expect(continuationRvolMetricLabel("time_adjusted")).toBe("Time-adjusted RVOL");
    expect(continuationRvolMetricLabel("rvol_20d")).toBe("20-day RVOL");
  });

  it("uses conservative ranking when metric kind is unknown", () => {
    const ctx = buildLateSessionContinuationContext({
      symbol: "AAA",
      sourceSessionDate: "2026-09-21",
      sourceTimestamp: "2026-09-21T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: 5_000_000,
      rvol: 50,
      rvolMetricKind: null,
    });
    expect(continuationRankingRvolFromContext(ctx)).toBe(
      rankingRvolFromRaw(50, "INSUFFICIENT_HISTORY"),
    );
  });
});

describe("Batch 12 — deduplication and merge integrity", () => {
  it("keeps newer capture values when two timestamps share a session", () => {
    const older = candidate({
      sourceTimestamp: "2026-09-21T19:00:00.000Z",
      rvol: 2,
      volume: 3_000_000,
    });
    const newer = candidate({
      sourceTimestamp: "2026-09-21T20:30:00.000Z",
      rvol: 8,
      volume: 6_000_000,
    });
    const merged = mergeLateSessionCandidateEntries(older, newer)!;
    expect(merged.context.rvol).toBe(8);
    expect(merged.context.volume).toBe(6_000_000);
  });

  it("does not merge conflicting security identities", () => {
    const a = candidate({ securityId: SEC_A });
    const b = candidate({ securityId: SEC_B, symbol: "AAA" });
    expect(mergeLateSessionCandidateEntries(a, b)).toBeNull();
    const collapsed = collapseLateSessionCandidates([a, b]);
    expect(collapsed).toHaveLength(2);
  });

  it("isolates different source sessions", () => {
    const d1 = candidate({ sourceSessionDate: "2026-09-21" });
    const d2 = candidate({ sourceSessionDate: "2026-09-22", sourceTimestamp: "2026-09-22T20:00:00.000Z" });
    expect(continuationCandidateIdentityKey(d1)).not.toBe(continuationCandidateIdentityKey(d2));
    expect(collapseLateSessionCandidates([d1, d2])).toHaveLength(2);
  });

  it("merges categories without duplicate cards", () => {
    const a = candidate({
      sourceCategory: "POWER_HOUR_MOMENTUM",
      sourceCategories: ["POWER_HOUR_MOMENTUM"],
    });
    const b = candidate({
      sourceTimestamp: "2026-09-21T20:10:00.000Z",
      sourceCategory: "STRONG_CLOSE_NEAR_HOD",
      sourceCategories: ["STRONG_CLOSE_NEAR_HOD"],
    });
    const out = collapseLateSessionCandidates([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0]!.sourceCategories).toEqual(
      expect.arrayContaining(["POWER_HOUR_MOMENTUM", "STRONG_CLOSE_NEAR_HOD"]),
    );
  });
});

describe("Batch 12 — session expiry", () => {
  it("expires standard categories after the next AM session", () => {
    const firstNext = nextTradingDay("2026-09-21").date;
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: "2026-09-21",
        sourceCategory: "POWER_HOUR_MOMENTUM",
        amSessionDate: firstNext,
      }).expiryState,
    ).toBe("active");
    const dayAfter = nextTradingDay(firstNext).date;
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: "2026-09-21",
        sourceCategory: "POWER_HOUR_MOMENTUM",
        amSessionDate: dayAfter,
      }).expiryState,
    ).toBe("expired");
  });

  it("extends Day-Two Watch through an additional session", () => {
    const through = computeValidThroughSessionDate("2026-09-21", "DAY_TWO_WATCH");
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: "2026-09-21",
        sourceCategory: "DAY_TWO_WATCH",
        amSessionDate: through,
      }).expiryState,
    ).toBe("active");
    expect(
      resolveLateSessionExpiryState({
        sourceSessionDate: "2026-09-21",
        sourceCategory: "DAY_TWO_WATCH",
        amSessionDate: nextTradingDay(through).date,
      }).expiryState,
    ).toBe("expired");
  });
});

describe("Batch 12 — funnel and volume-first ordering", () => {
  it("orders by session volume before RVOL tie-break", () => {
    const lowVol = candidate({ symbol: "LOW", volume: 2_000_000, rvol: 20 });
    const highVol = candidate({ symbol: "HIGH", volume: 9_000_000, rvol: 3 });
    expect(compareAmInboxLateSessionCandidates(lowVol, highVol)).toBeGreaterThan(0);
  });

  it("View All qualified set includes non-priority names", () => {
    const entries = [
      candidate({ symbol: "PRI", volume: 8_000_000, rvol: 5 }),
      candidate({ symbol: "ALT", volume: 6_000_000, rvol: 4 }),
    ];
    const view = buildAmInboxLateSessionViewFromContexts("2026-09-22", entries.map((e) => e.context));
    expect(view.qualifiedCandidates.length).toBeGreaterThanOrEqual(view.candidates.length);
    const funnel = buildLateSessionContinuationFunnel(entries, collapseLateSessionCandidates(entries));
    expect(funnel.qualified.length).toBeGreaterThanOrEqual(funnel.priority.length);
  });
});
