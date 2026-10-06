import { describe, expect, it } from "vitest";
import {
  describeSurveillanceInstant,
  explainBriefDecision,
  explainClosedSnapshot,
  explainDayTwo,
  explainTarvol,
  inspectSymbolSession,
  reservedRadarEventTypes,
  supportedRadarEventTypes,
  type SymbolObservation,
} from "@/lib/scanner-verification/symbol-session-diagnostic";
import {
  emptyRadarEventEngineState,
  stepRadarEventEngine,
} from "@/lib/radar/radar-event-engine";
import { qualifiesLateSessionHandoffCandidate } from "@/lib/am-inbox/late-session-handoff-qualification";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
const LIVE_MS = Date.parse("2026-10-05T14:00:00.000Z"); // 10:00 ET Monday
const GATES: SymbolObservation["gates"] = {
  price: "pass",
  move: "pass",
  volume: "pass",
  float: "pass",
  participation: "pass",
  freshness: "pass",
};

function observation(over: Partial<SymbolObservation> = {}): SymbolObservation {
  return {
    symbol: "TNMG",
    session_date: "2026-10-05",
    candidate_seen_at: "2026-10-05T14:00:00.000Z",
    qualified: true,
    reason_codes: [],
    rank: 3,
    visible_cap: 20,
    tab_filtered: false,
    freshness: "LIVE",
    last_provider_update: "2026-10-05T14:00:00.000Z",
    gates: GATES,
    tarvol: 2.4,
    participation_state: "RISING",
    recent_radar_events: [],
    late_session_category: null,
    day_two_am_session_date: null,
    ...over,
  };
}

describe("04:00 ET surveillance boundary", () => {
  const before = Date.parse("2026-10-05T07:59:59.999Z");
  const at = Date.parse("2026-10-05T08:00:00.000Z");
  const after = Date.parse("2026-10-05T08:00:01.000Z");

  it("keeps 03:59:59.999 ET on the prior surveillance date", () => {
    const described = describeSurveillanceInstant(before);
    expect(described.surveillance_date).toBe("2026-10-04");
    expect(described.live).toBe(false);
  });

  it("opens the new pre-market date at 04:00:00.000 ET", () => {
    const described = describeSurveillanceInstant(at);
    expect(described.surveillance_date).toBe("2026-10-05");
    expect(described.session_kind).toBe("pre-market");
    expect(described.live).toBe(true);
  });

  it("stays on the new date at 04:00:01 ET", () => {
    const described = describeSurveillanceInstant(after);
    expect(described.surveillance_date).toBe("2026-10-05");
    expect(described.session_kind).toBe("pre-market");
  });
});

describe("candidate lifecycle and visibility", () => {
  it("explains a qualification as appeared", () => {
    const row = inspectSymbolSession({ nowMs: LIVE_MS, prior: null, current: observation() });
    expect(row.transition).toBe("appeared");
    expect(row.promotion_reason).toBe("PROMOTED");
    expect(row.candidate_status).toBe("qualified");
    expect(row.visible_state).toBe("visible");
    expect(row.session_label).toBe("current");
  });

  it("explains a threshold miss as disappeared, not a visibility miss", () => {
    const row = inspectSymbolSession({
      nowMs: LIVE_MS,
      prior: { session_date: "2026-10-05", qualified: true, visible: true },
      current: observation({
        qualified: false,
        reason_codes: ["MOMENTUM_TOO_WEAK"],
        gates: { ...GATES, move: "fail" },
      }),
    });
    expect(row.transition).toBe("disappeared");
    expect(row.removal_reason).toBe("REMOVED_MOMENTUM_TOO_WEAK");
    expect(row.candidate_status).toBe("disqualified");
    expect(row.reason_not_visible).toBe("NOT_QUALIFIED");
  });

  it("explains a later pass as requalified", () => {
    const row = inspectSymbolSession({
      nowMs: LIVE_MS,
      prior: { session_date: "2026-10-05", qualified: false, visible: false },
      current: observation(),
    });
    expect(row.transition).toBe("reappeared");
    expect(row.requalification_reason).toBe("REQUALIFIED");
  });

  it("keeps a qualified name that falls below the visible cap", () => {
    const row = inspectSymbolSession({
      nowMs: LIVE_MS,
      prior: { session_date: "2026-10-05", qualified: true, visible: true },
      current: observation({ rank: 21, visible_cap: 20 }),
    });
    expect(row.candidate_status).toBe("qualified");
    expect(row.visible).toBe(false);
    expect(row.transition).toBe("hidden");
    expect(row.reason_not_visible).toBe("BELOW_VISIBLE_CAP");
  });

  it("records a tab filter separately from disqualification", () => {
    const row = inspectSymbolSession({
      nowMs: LIVE_MS,
      prior: null,
      current: observation({ tab_filtered: true }),
    });
    expect(row.candidate_status).toBe("qualified");
    expect(row.reason_not_visible).toBe("FILTERED_BY_TAB");
  });

  it("does not promote stale inputs", () => {
    const row = inspectSymbolSession({
      nowMs: LIVE_MS,
      prior: null,
      current: observation({ freshness: "STALE", gates: { ...GATES, freshness: "fail" } }),
    });
    expect(row.promotion_reason).toBeNull();
    expect(row.removal_reason).toBe("STALE_INPUT_NOT_PROMOTABLE");
    expect(row.candidate_status).toBe("stale");
    expect(row.visible).toBe(false);
  });

  it("labels a prior-session row instead of treating it as current", () => {
    const row = inspectSymbolSession({
      nowMs: LIVE_MS,
      prior: null,
      current: observation({
        session_date: "2026-10-02",
        last_provider_update: "2026-10-02T19:00:00.000Z",
      }),
    });
    expect(row.session_role).toBe("prior");
    expect(row.session_label).toBe("Previous Session");
    expect(row.candidate_status).toBe("session_mismatch");
    expect(row.visible).toBe(false);
  });
});

describe("radar event evidence", () => {
  it("lists the engine event types and keeps halt reserved", () => {
    expect(supportedRadarEventTypes()).toEqual([
      "VOLUME_100K",
      "VOLUME_500K",
      "VOLUME_1M",
      "MOMENTUM_TRIGGER",
      "RE_ACCELERATION",
      "PULLBACK",
      "SECOND_LEG",
      "NEW_HOD",
      "VWAP_RECLAIM",
      "VWAP_LOSS",
    ]);
    expect(reservedRadarEventTypes()).toEqual(["HALT", "RESUME"]);
  });

  it("does not emit a second volume event on a repeated evaluation", () => {
    const first = stepRadarEventEngine(emptyRadarEventEngineState("2026-10-05"), {
      symbol: "TNMG",
      surveillanceDate: "2026-10-05",
      eventNowMs: LIVE_MS,
      emitEvents: true,
      detect: false,
      active: false,
      sessionVolume: 100_000,
      lastPrice: 4,
      vol5s: 0,
      vol15s: 0,
      vol60s: 0,
      volumeAccelerationPct: null,
      move15sPct: null,
      move15Complete: false,
      sessionHigh: 4,
      sessionVwap: null,
      vwapSide: "unknown",
      distanceFromHodPct: null,
      freshnessAgeMs: 1_000,
      isoFromMs: (ms) => new Date(ms).toISOString(),
    });
    const second = stepRadarEventEngine(first.state, {
      symbol: "TNMG",
      surveillanceDate: "2026-10-05",
      eventNowMs: LIVE_MS + 500,
      emitEvents: true,
      detect: false,
      active: false,
      sessionVolume: 120_000,
      lastPrice: 4,
      vol5s: 0,
      vol15s: 0,
      vol60s: 0,
      volumeAccelerationPct: null,
      move15sPct: null,
      move15Complete: false,
      sessionHigh: 4,
      sessionVwap: null,
      vwapSide: "unknown",
      distanceFromHodPct: null,
      freshnessAgeMs: 1_000,
      isoFromMs: (ms) => new Date(ms).toISOString(),
    });
    expect(first.newEvents.map((event) => event.type)).toContain("VOLUME_100K");
    expect(second.newEvents.filter((event) => event.type === "VOLUME_100K")).toHaveLength(0);
  });
});

describe("TARVOL evidence", () => {
  const baseline = {
    avgCumulativeVolume: 100_000,
    historicalSessionCount: 8,
    targetSessionCount: 20,
    sufficient: true,
    invalid: false,
  };

  it("reports rising, surging, and cooling from acceleration", () => {
    expect(explainTarvol({ currentCumulativeVolume: 180_000, baseline, accelerationPct: 30 }).participation_state).toBe("RISING");
    expect(explainTarvol({ currentCumulativeVolume: 180_000, baseline, accelerationPct: 80 }).participation_state).toBe("SURGING");
    expect(explainTarvol({ currentCumulativeVolume: 180_000, baseline, accelerationPct: -25 }).participation_state).toBe("COOLING");
  });

  it("refuses an invalid or zero baseline", () => {
    expect(explainTarvol({
      currentCumulativeVolume: 180_000,
      baseline: { ...baseline, invalid: true },
      accelerationPct: 10,
    }).time_adjusted_rvol).toBeNull();
    expect(explainTarvol({
      currentCumulativeVolume: 180_000,
      baseline: { ...baseline, avgCumulativeVolume: 0, sufficient: false },
      accelerationPct: null,
    })).toMatchObject({ time_adjusted_rvol: null, participation_state: "UNAVAILABLE", baseline_usable: false });
  });
});

describe("late-session and closed snapshot", () => {
  it("qualifies a liquid continuation and rejects a thin one", () => {
    const pass = buildLateSessionContinuationContext({
      symbol: "AAA",
      sourceSessionDate: "2026-10-02",
      sourceTimestamp: "2026-10-02T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: 500_000,
      rvol: 4,
    });
    const fail = buildLateSessionContinuationContext({
      symbol: "BBB",
      sourceSessionDate: "2026-10-02",
      sourceTimestamp: "2026-10-02T20:00:00.000Z",
      sourceCategory: "POWER_HOUR_MOMENTUM",
      volume: 100_000,
      rvol: 4,
    });
    expect(qualifiesLateSessionHandoffCandidate({ context: pass, workflow: null, sourceCategories: ["POWER_HOUR_MOMENTUM"] })).toBe(true);
    expect(qualifiesLateSessionHandoffCandidate({ context: fail, workflow: null, sourceCategories: ["POWER_HOUR_MOMENTUM"] })).toBe(false);
  });

  it("keeps Day-Two on the next session and expires it after the window", () => {
    expect(explainDayTwo({
      sourceSessionDate: "2026-10-02",
      sourceCategory: "DAY_TWO_WATCH",
      amSessionDate: "2026-10-05",
    }).day_two_state).toBe("active");
    expect(explainDayTwo({
      sourceSessionDate: "2026-10-02",
      sourceCategory: "DAY_TWO_WATCH",
      amSessionDate: "2026-10-07",
    }).day_two_state).toBe("expired");
  });

  it("rejects a closed snapshot once the next pre-market is live", () => {
    const alignment = explainClosedSnapshot({
      nowMs: Date.parse("2026-10-05T08:10:00.000Z"),
      snapshotIso: "2026-10-02T23:59:00.000Z",
    });
    expect(alignment).toBe("previous_during_live");
  });
});

describe("pre-market brief evidence", () => {
  it("records a stale fail-closed run and a first generate", () => {
    expect(explainBriefDecision({
      action: "fail_closed",
      reason: "source_stale",
      candidateCount: 0,
    })).toMatchObject({ ran: false, stale: true, persisted: "none" });
    expect(explainBriefDecision({
      action: "generate",
      persist: "insert",
      candidateCount: 2,
    })).toMatchObject({ ran: true, persisted: "insert", stale: false });
  });

  it("records a duplicate invocation and an empty candidate set", () => {
    expect(explainBriefDecision({ action: "return_cached", candidateCount: 4 })).toMatchObject({
      duplicate_suppressed: true,
      persisted: "cached",
    });
    expect(explainBriefDecision({ action: "generate", persist: "insert", candidateCount: 0 }).reason).toBe("empty_candidate_set");
  });
});
