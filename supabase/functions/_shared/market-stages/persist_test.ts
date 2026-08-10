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
  PERSIST_RPC_NAME,
  persistMarketStageForward,
  type MarketStagePersistDb,
  type PersistRpcArgs,
  type PersistRpcPayload,
} from "./persist.ts";
import type { TransitionEvaluation, TransitionState } from "./transitions.ts";

const SYM = "AAPL";
const GEN = "11111111-2222-3333-4444-555555555555";
const W1 = "2024-01-05";
const W2 = "2024-01-12";
const W3 = "2024-01-19";
const W4 = "2024-01-26";

type Call =
  | { kind: "select"; table: string }
  | { kind: "rpc"; fn: string; args: PersistRpcArgs };

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

function evaluation(
  week: string,
  classification: ClassifyResult | null,
  fingerprint: string | null,
): TransitionEvaluation {
  return {
    symbol: SYM,
    algorithmId: ALGORITHM_ID,
    effectiveWeekEnd: week,
    calculatedAt: `${week}T21:00:00.000Z`,
    inputFingerprint: fingerprint,
    classification,
  };
}

function stateRow(state: TransitionState, generationId = GEN): Record<string, unknown> {
  return {
    symbol: state.symbol,
    algorithm_id: state.algorithmId,
    active_generation_id: generationId,
    confirmed_stage: state.confirmedStage,
    confirmed_effective_week_end: state.confirmedEffectiveWeekEnd,
    confirmed_at_week_end: state.confirmedAtWeekEnd,
    pending_stage: state.pendingStage,
    pending_count: state.pendingCount,
    pending_start_week_end: state.pendingStartWeekEnd,
    latest_processed_week_end: state.latestProcessedWeekEnd,
    latest_input_fingerprint: state.latestInputFingerprint,
    latest_evaluation_status: state.latestEvaluationStatus,
    latest_valid_candidate: state.latestValidCandidate,
    latest_valid_candidate_week_end: state.latestValidCandidateWeekEnd,
    latest_data_effective_week_end: state.latestDataEffectiveWeekEnd,
    revision: state.revision,
  };
}

function mockDb(
  calls: Call[],
  opts: {
    generation?: Record<string, unknown> | null;
    state?: Record<string, unknown> | null;
    generationError?: { message: string } | null;
    stateError?: { message: string } | null;
    rpcError?: { message: string } | null;
    rpcData?: PersistRpcPayload | null;
    rpcHandler?: (args: PersistRpcArgs) => PersistRpcPayload;
  } = {},
): MarketStagePersistDb {
  return {
    from(table: string) {
      return {
        select(_columns: string) {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              return chain;
            },
            async maybeSingle() {
              calls.push({ kind: "select", table });
              if (table === "market_stage_timeline_generations") {
                if (opts.generationError) {
                  return { data: null, error: opts.generationError };
                }
                return {
                  data: opts.generation === undefined
                    ? null
                    : opts.generation,
                  error: null,
                };
              }
              if (table === "market_stage_state") {
                if (opts.stateError) {
                  return { data: null, error: opts.stateError };
                }
                return {
                  data: opts.state === undefined ? null : opts.state,
                  error: null,
                };
              }
              return { data: null, error: { message: `unknown table ${table}` } };
            },
          };
          return chain;
        },
      };
    },
    async rpc(fn, args) {
      calls.push({ kind: "rpc", fn, args });
      if (opts.rpcError) return { data: null, error: opts.rpcError };
      if (opts.rpcHandler) {
        return { data: opts.rpcHandler(args), error: null };
      }
      return {
        data: opts.rpcData ?? {
          ok: true,
          outcome: "applied",
          generation_id: args.p_expected_generation_id ?? GEN,
          revision: args.p_next_revision,
        },
        error: null,
      };
    },
  };
}

function rpcCalls(calls: Call[]): Array<{ fn: string; args: PersistRpcArgs }> {
  return calls
    .filter((c): c is Extract<Call, { kind: "rpc" }> => c.kind === "rpc")
    .map((c) => ({ fn: c.fn, args: c.args }));
}

Deno.test("1. first evaluation runs atomic genesis RPC with expected revision 0", async () => {
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: null,
    state: null,
    rpcHandler: (args) => ({
      ok: true,
      outcome: "applied",
      generation_id: GEN,
      revision: args.p_next_revision,
    }),
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W1, okClassification("stage_2"), "fp-w1"),
  );

  assertEquals(r.status, "applied");
  assertEquals(r.wrote, true);
  assertEquals(r.reduce?.resultCode, "pending_opened");
  const rpcs = rpcCalls(calls);
  assertEquals(rpcs.length, 1);
  assertEquals(rpcs[0].fn, PERSIST_RPC_NAME);
  assertEquals(rpcs[0].args.p_expected_generation_id, null);
  assertEquals(rpcs[0].args.p_expected_revision, 0);
  assertEquals(rpcs[0].args.p_next_revision, 1);
  assertEquals(rpcs[0].args.p_pending_stage, "stage_2");
  assertEquals(rpcs[0].args.p_transition, null);
});

Deno.test("2. subsequent forward evaluation uses active generation and CAS revision", async () => {
  const prior: TransitionState = {
    symbol: SYM,
    algorithmId: ALGORITHM_ID,
    confirmedStage: null,
    confirmedEffectiveWeekEnd: null,
    confirmedAtWeekEnd: null,
    pendingStage: "stage_2",
    pendingCount: 1,
    pendingStartWeekEnd: W1,
    latestProcessedWeekEnd: W1,
    latestInputFingerprint: "fp-w1",
    latestEvaluationStatus: "ok",
    latestValidCandidate: "stage_2",
    latestValidCandidateWeekEnd: W1,
    latestDataEffectiveWeekEnd: W1,
    revision: 1,
  };
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: { id: GEN, status: "active" },
    state: stateRow(prior),
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W2, okClassification("stage_2"), "fp-w2"),
  );

  assertEquals(r.status, "applied");
  assertEquals(r.reduce?.resultCode, "confirmed_initial");
  const rpcs = rpcCalls(calls);
  assertEquals(rpcs.length, 1);
  assertEquals(rpcs[0].args.p_expected_generation_id, GEN);
  assertEquals(rpcs[0].args.p_expected_revision, 1);
  assertEquals(rpcs[0].args.p_next_revision, 2);
  assertEquals(rpcs[0].args.p_confirmed_stage, "stage_2");
  assertEquals(rpcs[0].args.p_transition, null);
});

Deno.test("3. initial two-week stage confirmation maps confirmed fields", async () => {
  const prior: TransitionState = {
    symbol: SYM,
    algorithmId: ALGORITHM_ID,
    confirmedStage: null,
    confirmedEffectiveWeekEnd: null,
    confirmedAtWeekEnd: null,
    pendingStage: "stage_1",
    pendingCount: 1,
    pendingStartWeekEnd: W1,
    latestProcessedWeekEnd: W1,
    latestInputFingerprint: "fp-w1",
    latestEvaluationStatus: "ok",
    latestValidCandidate: "stage_1",
    latestValidCandidateWeekEnd: W1,
    latestDataEffectiveWeekEnd: W1,
    revision: 1,
  };
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: { id: GEN, status: "active" },
    state: stateRow(prior),
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W2, okClassification("stage_1"), "fp-w2"),
  );

  assertEquals(r.reduce?.resultCode, "confirmed_initial");
  const args = rpcCalls(calls)[0].args;
  assertEquals(args.p_confirmed_stage, "stage_1");
  assertEquals(args.p_confirmed_effective_week_end, W1);
  assertEquals(args.p_confirmed_at_week_end, W2);
  assertEquals(args.p_pending_count, 0);
  assertEquals(args.p_transition, null);
});

Deno.test("4. confirmed stage-to-stage transition sends event with alert fields absent", async () => {
  const prior: TransitionState = {
    symbol: SYM,
    algorithmId: ALGORITHM_ID,
    confirmedStage: "stage_1",
    confirmedEffectiveWeekEnd: W1,
    confirmedAtWeekEnd: W2,
    pendingStage: "stage_2",
    pendingCount: 1,
    pendingStartWeekEnd: W3,
    latestProcessedWeekEnd: W3,
    latestInputFingerprint: "fp-w3",
    latestEvaluationStatus: "ok",
    latestValidCandidate: "stage_2",
    latestValidCandidateWeekEnd: W3,
    latestDataEffectiveWeekEnd: W3,
    revision: 3,
  };
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: { id: GEN, status: "active" },
    state: stateRow(prior),
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W4, okClassification("stage_2"), "fp-w4"),
  );

  assertEquals(r.reduce?.resultCode, "confirmed_transition");
  assert(r.reduce?.event !== null);
  const tr = rpcCalls(calls)[0].args.p_transition;
  assert(tr !== null);
  assertEquals(tr!.from_stage, "stage_1");
  assertEquals(tr!.to_stage, "stage_2");
  assertEquals(
    tr!.event_identity,
    `${ALGORITHM_ID}|${SYM}|stage_1|stage_2|${W3}|${W4}`,
  );
  assertEquals(
    Object.prototype.hasOwnProperty.call(tr, "alert_eligible"),
    false,
  );
});

Deno.test("5. duplicate evaluation is successful no-op without RPC write", async () => {
  const prior: TransitionState = {
    symbol: SYM,
    algorithmId: ALGORITHM_ID,
    confirmedStage: "stage_2",
    confirmedEffectiveWeekEnd: W1,
    confirmedAtWeekEnd: W2,
    pendingStage: null,
    pendingCount: 0,
    pendingStartWeekEnd: null,
    latestProcessedWeekEnd: W2,
    latestInputFingerprint: "fp-w2",
    latestEvaluationStatus: "ok",
    latestValidCandidate: "stage_2",
    latestValidCandidateWeekEnd: W2,
    latestDataEffectiveWeekEnd: W2,
    revision: 2,
  };
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: { id: GEN, status: "active" },
    state: stateRow(prior),
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W2, okClassification("stage_2"), "fp-w2"),
  );

  assertEquals(r.status, "no_op");
  assertEquals(r.resultCode, "duplicate_evaluation");
  assertEquals(r.wrote, false);
  assertEquals(rpcCalls(calls).length, 0);
});

Deno.test("6. duplicate transition RPC outcome is successful no-op", async () => {
  const prior: TransitionState = {
    symbol: SYM,
    algorithmId: ALGORITHM_ID,
    confirmedStage: "stage_1",
    confirmedEffectiveWeekEnd: W1,
    confirmedAtWeekEnd: W2,
    pendingStage: "stage_2",
    pendingCount: 1,
    pendingStartWeekEnd: W3,
    latestProcessedWeekEnd: W3,
    latestInputFingerprint: "fp-w3",
    latestEvaluationStatus: "ok",
    latestValidCandidate: "stage_2",
    latestValidCandidateWeekEnd: W3,
    latestDataEffectiveWeekEnd: W3,
    revision: 3,
  };
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: { id: GEN, status: "active" },
    state: stateRow(prior),
    rpcData: {
      ok: true,
      outcome: "duplicate_transition",
      generation_id: GEN,
      revision: 4,
    },
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W4, okClassification("stage_2"), "fp-w4"),
  );

  assertEquals(r.reduce?.resultCode, "confirmed_transition");
  assertEquals(r.status, "no_op");
  assertEquals(r.resultCode, "duplicate_transition");
  assertEquals(r.wrote, false);
  assertEquals(rpcCalls(calls).length, 1);
});

Deno.test("7. conflicting duplicate transition fails closed", async () => {
  const prior: TransitionState = {
    symbol: SYM,
    algorithmId: ALGORITHM_ID,
    confirmedStage: "stage_1",
    confirmedEffectiveWeekEnd: W1,
    confirmedAtWeekEnd: W2,
    pendingStage: "stage_2",
    pendingCount: 1,
    pendingStartWeekEnd: W3,
    latestProcessedWeekEnd: W3,
    latestInputFingerprint: "fp-w3",
    latestEvaluationStatus: "ok",
    latestValidCandidate: "stage_2",
    latestValidCandidateWeekEnd: W3,
    latestDataEffectiveWeekEnd: W3,
    revision: 3,
  };
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: { id: GEN, status: "active" },
    state: stateRow(prior),
    rpcError: { message: "market_stages_forward_transition_conflict" },
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W4, okClassification("stage_2"), "fp-w4"),
  );

  assertEquals(r.status, "transition_conflict");
  assertEquals(r.wrote, false);
  assert(r.status !== "applied");
  assert(r.status !== "no_op");
});

Deno.test("8. same-week different fingerprint returns replay_required with no RPC", async () => {
  const prior: TransitionState = {
    symbol: SYM,
    algorithmId: ALGORITHM_ID,
    confirmedStage: null,
    confirmedEffectiveWeekEnd: null,
    confirmedAtWeekEnd: null,
    pendingStage: "stage_2",
    pendingCount: 1,
    pendingStartWeekEnd: W1,
    latestProcessedWeekEnd: W1,
    latestInputFingerprint: "fp-w1",
    latestEvaluationStatus: "ok",
    latestValidCandidate: "stage_2",
    latestValidCandidateWeekEnd: W1,
    latestDataEffectiveWeekEnd: W1,
    revision: 1,
  };
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: { id: GEN, status: "active" },
    state: stateRow(prior),
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W1, okClassification("stage_2"), "fp-w1-changed"),
  );

  assertEquals(r.status, "replay_required");
  assertEquals(r.resultCode, "replay_required_same_week");
  assertEquals(r.wrote, false);
  assertEquals(rpcCalls(calls).length, 0);
});

Deno.test("9. historical week returns replay_required with no RPC", async () => {
  const prior: TransitionState = {
    symbol: SYM,
    algorithmId: ALGORITHM_ID,
    confirmedStage: "stage_2",
    confirmedEffectiveWeekEnd: W1,
    confirmedAtWeekEnd: W2,
    pendingStage: null,
    pendingCount: 0,
    pendingStartWeekEnd: null,
    latestProcessedWeekEnd: W2,
    latestInputFingerprint: "fp-w2",
    latestEvaluationStatus: "ok",
    latestValidCandidate: "stage_2",
    latestValidCandidateWeekEnd: W2,
    latestDataEffectiveWeekEnd: W2,
    revision: 2,
  };
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: { id: GEN, status: "active" },
    state: stateRow(prior),
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W1, okClassification("stage_2"), "fp-old"),
  );

  assertEquals(r.status, "replay_required");
  assertEquals(r.resultCode, "replay_required_historical_week");
  assertEquals(rpcCalls(calls).length, 0);
});

Deno.test("10. stale revision / CAS rejection is mapped and not success", async () => {
  const prior: TransitionState = {
    symbol: SYM,
    algorithmId: ALGORITHM_ID,
    confirmedStage: null,
    confirmedEffectiveWeekEnd: null,
    confirmedAtWeekEnd: null,
    pendingStage: "stage_2",
    pendingCount: 1,
    pendingStartWeekEnd: W1,
    latestProcessedWeekEnd: W1,
    latestInputFingerprint: "fp-w1",
    latestEvaluationStatus: "ok",
    latestValidCandidate: "stage_2",
    latestValidCandidateWeekEnd: W1,
    latestDataEffectiveWeekEnd: W1,
    revision: 1,
  };
  const db = mockDb([], {
    generation: { id: GEN, status: "active" },
    state: stateRow(prior),
    rpcData: {
      ok: false,
      outcome: "stale_revision",
      current_revision: 2,
    },
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W2, okClassification("stage_2"), "fp-w2"),
  );

  assertEquals(r.status, "stale_revision");
  assertEquals(r.resultCode, "stale_revision");
  assertEquals(r.wrote, false);
  assertEquals(r.revision, 2);
});

Deno.test("11. inactive or superseded generation is rejected without write success", async () => {
  const db = mockDb([], {
    generation: null,
    state: stateRow({
      symbol: SYM,
      algorithmId: ALGORITHM_ID,
      confirmedStage: null,
      confirmedEffectiveWeekEnd: null,
      confirmedAtWeekEnd: null,
      pendingStage: null,
      pendingCount: 0,
      pendingStartWeekEnd: null,
      latestProcessedWeekEnd: W1,
      latestInputFingerprint: "fp",
      latestEvaluationStatus: "ok",
      latestValidCandidate: "stage_2",
      latestValidCandidateWeekEnd: W1,
      latestDataEffectiveWeekEnd: W1,
      revision: 1,
    }, "99999999-9999-9999-9999-999999999999"),
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W2, okClassification("stage_2"), "fp-w2"),
  );

  assertEquals(r.status, "inactive_generation");
  assertEquals(r.wrote, false);
});

Deno.test("12. unavailable evaluation maps NULL fingerprint and empty reason/metrics", async () => {
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: null,
    state: null,
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W1, null, null),
  );

  assertEquals(r.status, "applied");
  assertEquals(r.reduce?.resultCode, "availability_recorded");
  const args = rpcCalls(calls)[0].args;
  assertEquals(args.p_evaluation_status, "unavailable");
  assertEquals(args.p_candidate_stage, null);
  assertEquals(args.p_input_fingerprint, null);
  assertEquals(args.p_p1_status, null);
  assertEquals(args.p_reason_codes, []);
  assertEquals(args.p_metrics, {});
  assertEquals(args.p_latest_evaluation_status, "unavailable");
  assertEquals(args.p_latest_input_fingerprint, null);
});

Deno.test("13. RPC transition payload never sets alert_eligible true", async () => {
  const prior: TransitionState = {
    symbol: SYM,
    algorithmId: ALGORITHM_ID,
    confirmedStage: "stage_1",
    confirmedEffectiveWeekEnd: W1,
    confirmedAtWeekEnd: W2,
    pendingStage: "stage_2",
    pendingCount: 1,
    pendingStartWeekEnd: W3,
    latestProcessedWeekEnd: W3,
    latestInputFingerprint: "fp-w3",
    latestEvaluationStatus: "ok",
    latestValidCandidate: "stage_2",
    latestValidCandidateWeekEnd: W3,
    latestDataEffectiveWeekEnd: W3,
    revision: 3,
  };
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: { id: GEN, status: "active" },
    state: stateRow(prior),
  });

  await persistMarketStageForward(
    db,
    evaluation(W4, okClassification("stage_2"), "fp-w4"),
  );

  const args = rpcCalls(calls)[0].args;
  assert(args.p_transition !== null);
  assertEquals(
    JSON.stringify(args).includes('"alert_eligible":true'),
    false,
  );
  assertEquals(
    JSON.stringify(args.p_transition).includes("alert_eligible"),
    false,
  );
});

Deno.test("14. RPC failure is surfaced and never reported as success", async () => {
  const calls: Call[] = [];
  const db = mockDb(calls, {
    generation: null,
    state: null,
    rpcError: { message: "connection refused" },
  });

  const r = await persistMarketStageForward(
    db,
    evaluation(W1, okClassification("stage_2"), "fp-w1"),
  );

  assertEquals(r.status, "database_failure");
  assertEquals(r.resultCode, "database_failure");
  assertEquals(r.wrote, false);
  assert(r.status !== "applied");
  assert(r.status !== "no_op");
});

Deno.test("adapter failure outcomes omit fingerprint from status fields", async () => {
  const db = mockDb([], {
    generation: null,
    state: null,
    rpcError: { message: "boom" },
  });
  const r = await persistMarketStageForward(
    db,
    evaluation(W1, okClassification("stage_2"), "super-secret-fingerprint"),
  );
  assertEquals(r.status, "database_failure");
  assertEquals(r.resultCode, "database_failure");
  assertEquals(r.wrote, false);
  assertEquals(String(r.status).includes("super-secret-fingerprint"), false);
  assertEquals(String(r.resultCode).includes("super-secret-fingerprint"), false);
});