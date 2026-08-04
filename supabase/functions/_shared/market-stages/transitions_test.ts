import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ALGORITHM_ID,
  type CandidateStage,
  type ClassifyMetrics,
  type ClassifyResult,
} from "./classify.ts";
import {
  reduceMarketStageTransition,
  type TransitionEvaluation,
  type TransitionState,
} from "./transitions.ts";

const SYM = "AAPL";
// Canonical Fridays
const W1 = "2024-01-05";
const W2 = "2024-01-12";
const W3 = "2024-01-19";
const W4 = "2024-01-26";
const W6 = "2024-02-09"; // skip W5 → gap from W4

function emptyMetrics(): ClassifyMetrics {
  return {
    sma30: 100,
    sma30TenWeeksAgo: 98,
    slopePct10: 0.02,
    rangeHigh26: 110,
    rangeLow26: 90,
    rangePosition: 0.5,
    averageVolume10: 1_000_000,
    volumeRatio: 1.2,
    aboveSma30: true,
    belowSma30: false,
    breakout26: false,
    breakdown26: false,
    volumeConfirmed: true,
  };
}

function okClassification(stage: CandidateStage): ClassifyResult {
  return {
    algorithmId: ALGORITHM_ID,
    status: "ok",
    candidateStage: stage,
    reasonCodes: [stage],
    metrics: emptyMetrics(),
  };
}

function nonOkClassification(
  status: "insufficient_data" | "invalid_input",
): ClassifyResult {
  return {
    algorithmId: ALGORITHM_ID,
    status,
    candidateStage: null,
    reasonCodes: status === "insufficient_data"
      ? ["too_few_bars"]
      : ["invalid_ohlc"],
    metrics: {
      sma30: null,
      sma30TenWeeksAgo: null,
      slopePct10: null,
      rangeHigh26: null,
      rangeLow26: null,
      rangePosition: null,
      averageVolume10: null,
      volumeRatio: null,
      aboveSma30: null,
      belowSma30: null,
      breakout26: null,
      breakdown26: null,
      volumeConfirmed: null,
    },
  };
}

function evaluation(
  week: string,
  classification: ClassifyResult | null,
  fingerprint: string | null,
  opts: { symbol?: string; algorithmId?: typeof ALGORITHM_ID } = {},
): TransitionEvaluation {
  return {
    symbol: opts.symbol ?? SYM,
    algorithmId: opts.algorithmId ?? ALGORITHM_ID,
    effectiveWeekEnd: week,
    calculatedAt: `${week}T21:00:00.000Z`,
    inputFingerprint: fingerprint,
    classification,
  };
}

function snapshot<T>(value: T): T {
  return structuredClone(value);
}

function assertNoForbiddenFields(value: unknown): void {
  const text = JSON.stringify(value);
  for (
    const term of [
      "score",
      "confidence",
      "rank",
      "tier",
      "probability",
      "recommendation",
      "alertDelivery",
      "alert_delivery",
      "deliveredAt",
      "notification",
    ]
  ) {
    assert(
      !new RegExp(`"${term}"\\s*:`, "i").test(text),
      `forbidden field present: ${term}`,
    );
  }
}

function confirmInitial(stage: CandidateStage): TransitionState {
  const r1 = reduceMarketStageTransition(
    null,
    evaluation(W1, okClassification(stage), "fp-w1"),
  );
  assertEquals(r1.resultCode, "pending_opened");
  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(W2, okClassification(stage), "fp-w2"),
  );
  assertEquals(r2.resultCode, "confirmed_initial");
  assertEquals(r2.event, null);
  return r2.nextState!;
}

// ── Core confirmation ──────────────────────────────────────────────────────

Deno.test("1. first candidate opens pending", () => {
  const r = reduceMarketStageTransition(
    null,
    evaluation(W1, okClassification("stage_2"), "fp1"),
  );
  assertEquals(r.status, "applied");
  assertEquals(r.resultCode, "pending_opened");
  assertEquals(r.nextState!.pendingStage, "stage_2");
  assertEquals(r.nextState!.pendingCount, 1);
  assertEquals(r.nextState!.pendingStartWeekEnd, W1);
  assertEquals(r.nextState!.confirmedStage, null);
  assertEquals(r.event, null);
  assertEquals(r.nextState!.revision, 1);
});

Deno.test("2-3. two adjacent equal candidates create initial confirmation with no event", () => {
  const r1 = reduceMarketStageTransition(
    null,
    evaluation(W1, okClassification("stage_1"), "fp1"),
  );
  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(W2, okClassification("stage_1"), "fp2"),
  );
  assertEquals(r2.status, "applied");
  assertEquals(r2.resultCode, "confirmed_initial");
  assertEquals(r2.event, null);
  assertEquals(r2.nextState!.confirmedStage, "stage_1");
  assertEquals(r2.nextState!.confirmedEffectiveWeekEnd, W1);
  assertEquals(r2.nextState!.confirmedAtWeekEnd, W2);
  assertEquals(r2.nextState!.pendingCount, 0);
  assertEquals(r2.nextState!.pendingStage, null);
});

Deno.test("4. third week is not required for confirmation", () => {
  const state = confirmInitial("stage_2");
  assertEquals(state.confirmedStage, "stage_2");
  assertEquals(state.confirmedAtWeekEnd, W2);
});

Deno.test("5-9. differing candidate pending then confirms with one event and week semantics", () => {
  const state = confirmInitial("stage_2");
  const r1 = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_3"), "fp3"),
  );
  assertEquals(r1.resultCode, "pending_opened");
  assertEquals(r1.nextState!.pendingStage, "stage_3");
  assertEquals(r1.nextState!.pendingCount, 1);
  assertEquals(r1.nextState!.pendingStartWeekEnd, W3);
  assertEquals(r1.event, null);

  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(W4, okClassification("stage_3"), "fp4"),
  );
  assertEquals(r2.resultCode, "confirmed_transition");
  assertEquals(r2.event!.fromStage, "stage_2");
  assertEquals(r2.event!.toStage, "stage_3");
  assertEquals(r2.event!.effectiveWeekEnd, W3);
  assertEquals(r2.event!.pendingStartWeekEnd, W3);
  assertEquals(r2.event!.confirmedWeekEnd, W4);
  assertEquals(r2.nextState!.confirmedEffectiveWeekEnd, W3);
  assertEquals(r2.nextState!.confirmedAtWeekEnd, W4);
});

Deno.test("10. pending target replacement resets the streak", () => {
  const state = confirmInitial("stage_2");
  const r1 = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_3"), "fp3"),
  );
  assertEquals(r1.resultCode, "pending_opened");
  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(W4, okClassification("stage_4"), "fp4"),
  );
  assertEquals(r2.resultCode, "pending_replaced");
  assertEquals(r2.nextState!.pendingStage, "stage_4");
  assertEquals(r2.nextState!.pendingCount, 1);
  assertEquals(r2.nextState!.pendingStartWeekEnd, W4);
  assertEquals(r2.nextState!.confirmedStage, "stage_2");
  assertEquals(r2.event, null);
});

Deno.test("11. return to confirmed stage clears pending", () => {
  const state = confirmInitial("stage_2");
  const r1 = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_3"), "fp3"),
  );
  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(W4, okClassification("stage_2"), "fp4"),
  );
  assertEquals(r2.resultCode, "pending_cleared");
  assertEquals(r2.nextState!.pendingCount, 0);
  assertEquals(r2.nextState!.pendingStage, null);
  assertEquals(r2.nextState!.confirmedStage, "stage_2");
  assertEquals(r2.event, null);
});

Deno.test("12. confirming unclassified", () => {
  const r1 = reduceMarketStageTransition(
    null,
    evaluation(W1, okClassification("unclassified"), "fp1"),
  );
  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(W2, okClassification("unclassified"), "fp2"),
  );
  assertEquals(r2.resultCode, "confirmed_initial");
  assertEquals(r2.nextState!.confirmedStage, "unclassified");
  assertEquals(r2.event, null);
});

Deno.test("13. transition out of unclassified", () => {
  const state = confirmInitial("unclassified");
  const r1 = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_2"), "fp3"),
  );
  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(W4, okClassification("stage_2"), "fp4"),
  );
  assertEquals(r2.resultCode, "confirmed_transition");
  assertEquals(r2.event!.fromStage, "unclassified");
  assertEquals(r2.event!.toStage, "stage_2");
});

// ── Missing / unavailable evidence ─────────────────────────────────────────

Deno.test("14. insufficient_data resets pending and preserves confirmed", () => {
  const state = confirmInitial("stage_2");
  const pending = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_4"), "fp3"),
  );
  assertEquals(pending.resultCode, "pending_opened");
  const r = reduceMarketStageTransition(
    pending.nextState,
    evaluation(W4, nonOkClassification("insufficient_data"), "fp4"),
  );
  assertEquals(r.resultCode, "availability_recorded");
  assertEquals(r.nextState!.confirmedStage, "stage_2");
  assertEquals(r.nextState!.pendingCount, 0);
  assertEquals(r.nextState!.latestEvaluationStatus, "insufficient_data");
  assertEquals(r.nextState!.latestValidCandidate, "stage_4");
  assertEquals(r.nextState!.latestValidCandidateWeekEnd, W3);
  assertEquals(r.nextState!.latestDataEffectiveWeekEnd, W3);
  assert(r.reasonCodes.includes("pending_reset_for_insufficient_data"));
  assertEquals(r.event, null);
});

Deno.test("15. invalid_input resets pending and preserves confirmed", () => {
  const state = confirmInitial("stage_1");
  const pending = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_2"), "fp3"),
  );
  const r = reduceMarketStageTransition(
    pending.nextState,
    evaluation(W4, nonOkClassification("invalid_input"), "fp4"),
  );
  assertEquals(r.resultCode, "availability_recorded");
  assertEquals(r.nextState!.confirmedStage, "stage_1");
  assertEquals(r.nextState!.pendingCount, 0);
  assertEquals(r.nextState!.latestEvaluationStatus, "invalid_input");
  assert(r.reasonCodes.includes("pending_reset_for_invalid_input"));
});

Deno.test("16-17. unavailable resets pending; next ok starts at count 1", () => {
  const state = confirmInitial("stage_2");
  const pending = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_3"), "fp3"),
  );
  const u = reduceMarketStageTransition(
    pending.nextState,
    evaluation(W4, null, null),
  );
  assertEquals(u.resultCode, "availability_recorded");
  assertEquals(u.nextState!.latestEvaluationStatus, "unavailable");
  assertEquals(u.nextState!.pendingCount, 0);
  assertEquals(u.nextState!.confirmedStage, "stage_2");
  assertEquals(u.nextState!.latestValidCandidateWeekEnd, W3);
  assert(u.reasonCodes.includes("pending_reset_for_unavailable"));

  const next = reduceMarketStageTransition(
    u.nextState,
    evaluation(W6, okClassification("stage_3"), "fp6"), // W6 is adjacent to W4? W4=01-26, W5=02-02, W6=02-09
  );
  // W4 -> W6 is 14 days = gap. Still opens pending at 1.
  assertEquals(next.resultCode, "pending_opened");
  assertEquals(next.nextState!.pendingCount, 1);
  assertEquals(next.nextState!.pendingStartWeekEnd, W6);
});

Deno.test("17b. next valid adjacent week after unavailable starts at count 1", () => {
  const state = confirmInitial("stage_2");
  const pending = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_3"), "fp3"),
  );
  const u = reduceMarketStageTransition(
    pending.nextState,
    evaluation(W4, null, null),
  );
  const w5 = "2024-02-02";
  const next = reduceMarketStageTransition(
    u.nextState,
    evaluation(w5, okClassification("stage_3"), "fp5"),
  );
  assertEquals(next.resultCode, "pending_opened");
  assertEquals(next.nextState!.pendingCount, 1);
  assertEquals(next.nextState!.pendingStartWeekEnd, w5);
});

Deno.test("18. skipped week resets pending", () => {
  const state = confirmInitial("stage_2");
  const pending = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_4"), "fp3"),
  );
  assertEquals(pending.nextState!.pendingCount, 1);
  // Jump W3 -> W6 (skip two Fridays' adjacency from latest W3: W4 then W5; W6 is +21 days)
  const r = reduceMarketStageTransition(
    pending.nextState,
    evaluation(W6, okClassification("stage_4"), "fp6"),
  );
  assertEquals(r.resultCode, "pending_opened");
  assert(r.reasonCodes.includes("week_gap_detected"));
  assert(r.reasonCodes.includes("pending_reset_for_gap"));
  assertEquals(r.nextState!.pendingCount, 1);
  assertEquals(r.nextState!.pendingStartWeekEnd, W6);
  assertEquals(r.nextState!.confirmedStage, "stage_2");
});

Deno.test("19. holiday-shortened week remains adjacent via canonical Fridays", () => {
  // Thanksgiving week still identified by its Friday.
  const friA = "2024-11-29";
  const friB = "2024-12-06";
  const r1 = reduceMarketStageTransition(
    null,
    evaluation(friA, okClassification("stage_2"), "fpA"),
  );
  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(friB, okClassification("stage_2"), "fpB"),
  );
  assertEquals(r2.resultCode, "confirmed_initial");
  assertEquals(r2.nextState!.confirmedEffectiveWeekEnd, friA);
  assertEquals(r2.nextState!.confirmedAtWeekEnd, friB);
});

// ── Duplicate / replay ─────────────────────────────────────────────────────

Deno.test("20. same-week same-fingerprint is byte-identical no-op", () => {
  const state = confirmInitial("stage_2");
  const before = snapshot(state);
  const r = reduceMarketStageTransition(
    state,
    evaluation(W2, okClassification("stage_2"), "fp-w2"),
  );
  assertEquals(r.status, "no_op");
  assertEquals(r.resultCode, "duplicate_evaluation");
  assertEquals(r.nextState, before);
  assertEquals(r.event, null);
  assertEquals(r.nextState!.revision, state.revision);
});

Deno.test("21-23. same-week different fingerprint and older week require replay without mutation", () => {
  const state = confirmInitial("stage_2");
  const before = snapshot(state);

  const same = reduceMarketStageTransition(
    state,
    evaluation(W2, okClassification("stage_2"), "fp-different"),
  );
  assertEquals(same.status, "replay_required");
  assertEquals(same.resultCode, "replay_required_same_week");
  assertEquals(same.nextState, before);
  assertEquals(same.event, null);

  const older = reduceMarketStageTransition(
    state,
    evaluation(W1, okClassification("stage_2"), "fp-old"),
  );
  assertEquals(older.status, "replay_required");
  assertEquals(older.resultCode, "replay_required_historical_week");
  assertEquals(older.nextState, before);
  assertEquals(older.event, null);
  assertEquals(state, before);
});

Deno.test("24-25. direct stage 2 to stage 4 with no synthetic intermediate event", () => {
  const state = confirmInitial("stage_2");
  const r1 = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_4"), "fp3"),
  );
  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(W4, okClassification("stage_4"), "fp4"),
  );
  assertEquals(r2.resultCode, "confirmed_transition");
  assertEquals(r2.event!.fromStage, "stage_2");
  assertEquals(r2.event!.toStage, "stage_4");
  assert(!JSON.stringify(r2.event).includes("stage_3"));
});

Deno.test("26. candidate matching confirmed preserves original confirmed dates", () => {
  const state = confirmInitial("stage_2");
  assertEquals(state.confirmedEffectiveWeekEnd, W1);
  assertEquals(state.confirmedAtWeekEnd, W2);
  const r = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_2"), "fp3"),
  );
  assertEquals(r.resultCode, "confirmed_unchanged");
  assertEquals(r.nextState!.confirmedEffectiveWeekEnd, W1);
  assertEquals(r.nextState!.confirmedAtWeekEnd, W2);
  assertEquals(r.nextState!.confirmedStage, "stage_2");
});

Deno.test("27-28. event identity formula excludes fingerprint", () => {
  const state = confirmInitial("stage_2");
  const r1 = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_3"), "fp3"),
  );
  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(W4, okClassification("stage_3"), "fp4-confirm"),
  );
  const expected = [
    ALGORITHM_ID,
    SYM,
    "stage_2",
    "stage_3",
    W3,
    W4,
  ].join("|");
  assertEquals(r2.event!.eventIdentity, expected);
  assert(!r2.event!.eventIdentity.includes("fp4-confirm"));
  assertEquals(r2.event!.confirmationInputFingerprint, "fp4-confirm");
});

Deno.test("29. symbol identity mismatch is rejected", () => {
  const state = confirmInitial("stage_2");
  const before = snapshot(state);
  const r = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_3"), "fp3", { symbol: "MSFT" }),
  );
  assertEquals(r.status, "rejected");
  assertEquals(r.resultCode, "rejected_identity_mismatch");
  assertEquals(r.nextState, before);
  assertEquals(r.event, null);
});

Deno.test("30. algorithm-version mismatch is rejected", () => {
  const state = confirmInitial("stage_2");
  const ev = evaluation(W3, okClassification("stage_3"), "fp3");
  // Force illegal algorithm on evaluation without changing P1 type via cast escape hatch
  const bad = {
    ...ev,
    algorithmId: "mss.weinstein.v2",
  } as unknown as TransitionEvaluation;
  const r = reduceMarketStageTransition(state, bad);
  assertEquals(r.status, "rejected");
  assertEquals(r.resultCode, "rejected_invalid_evaluation");
});

Deno.test("31. malformed state is rejected", () => {
  const state = confirmInitial("stage_2");
  const bad = snapshot(state);
  bad.pendingCount = 1;
  bad.pendingStage = null;
  bad.pendingStartWeekEnd = null;
  const r = reduceMarketStageTransition(
    bad,
    evaluation(W3, okClassification("stage_3"), "fp3"),
  );
  assertEquals(r.status, "rejected");
  assertEquals(r.resultCode, "rejected_invalid_evaluation");
  assertEquals(r.event, null);
});

Deno.test("32-33. revision increments only for accepted forward changes", () => {
  const r1 = reduceMarketStageTransition(
    null,
    evaluation(W1, okClassification("stage_2"), "fp1"),
  );
  assertEquals(r1.nextState!.revision, 1);
  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(W2, okClassification("stage_2"), "fp2"),
  );
  assertEquals(r2.nextState!.revision, 2);

  const dup = reduceMarketStageTransition(
    r2.nextState,
    evaluation(W2, okClassification("stage_2"), "fp2"),
  );
  assertEquals(dup.status, "no_op");
  assertEquals(dup.nextState!.revision, 2);

  const replay = reduceMarketStageTransition(
    r2.nextState,
    evaluation(W2, okClassification("stage_2"), "fp-other"),
  );
  assertEquals(replay.status, "replay_required");
  assertEquals(replay.nextState!.revision, 2);

  const rejected = reduceMarketStageTransition(
    r2.nextState,
    evaluation(W3, okClassification("stage_3"), "fp3", { symbol: "MSFT" }),
  );
  assertEquals(rejected.status, "rejected");
  assertEquals(rejected.nextState!.revision, 2);

  const r3 = reduceMarketStageTransition(
    r2.nextState,
    evaluation(W3, okClassification("stage_2"), "fp3"),
  );
  assertEquals(r3.status, "applied");
  assertEquals(r3.nextState!.revision, 3);
});

Deno.test("34. repeated identical call produces deeply identical result", () => {
  const state = confirmInitial("stage_2");
  const ev = evaluation(W3, okClassification("stage_3"), "fp3");
  const a = reduceMarketStageTransition(state, ev);
  const b = reduceMarketStageTransition(state, ev);
  assertEquals(a, b);
});

Deno.test("35. prior state and evaluation inputs are not mutated", () => {
  const state = confirmInitial("stage_2");
  const ev = evaluation(W3, okClassification("stage_3"), "fp3");
  const stateBefore = snapshot(state);
  const evBefore = snapshot(ev);
  reduceMarketStageTransition(state, ev);
  assertEquals(state, stateBefore);
  assertEquals(ev, evBefore);
});

Deno.test("36. output contains no score/confidence/rank/tier/probability/recommendation/alert-delivery fields", () => {
  const state = confirmInitial("stage_2");
  const r1 = reduceMarketStageTransition(
    state,
    evaluation(W3, okClassification("stage_4"), "fp3"),
  );
  const r2 = reduceMarketStageTransition(
    r1.nextState,
    evaluation(W4, okClassification("stage_4"), "fp4"),
  );
  assertNoForbiddenFields(r2);
  assertNoForbiddenFields(r2.nextState);
  assertNoForbiddenFields(r2.event);
});

Deno.test("37. P1 exports remain consumable and algorithm id locked", () => {
  // Byte-for-byte P1 integrity is asserted via git in verification.
  // This test locks the import contract P2B consumes.
  assertEquals(ALGORITHM_ID, "mss.weinstein.v1");
  const sample = okClassification("stage_2");
  assertEquals(sample.algorithmId, ALGORITHM_ID);
  assertEquals(sample.status, "ok");
  assertEquals(sample.candidateStage, "stage_2");
});
