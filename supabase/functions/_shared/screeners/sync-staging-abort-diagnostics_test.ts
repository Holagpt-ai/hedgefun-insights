import { assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { TabEvaluationEvidenceMap } from "./evaluation-evidence.ts";
import {
  buildNewerGenerationLiveAbortDetail,
  buildPriorGenerationRetentionAbortDetail,
} from "./generation-abort-diagnostics.ts";
import {
  isExtendedSyncSession,
  resolveSyncSessionKind,
} from "./session-sync-context.ts";
import { isLiveSurveillanceSessionKind } from "./screener-session.ts";
import { emptyChunkArtifacts } from "./sync-staging-types.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { jobInsertRowJsonRoundTrip } from "./sync-staging-serialize.ts";
import type { StagedGenerationJob } from "./sync-staging-types.ts";

function baseJob(overrides: Partial<StagedGenerationJob>): StagedGenerationJob {
  const nowMs = Date.parse("2026-10-30T18:00:00.000Z");
  const syncRunId = crypto.randomUUID();
  const sessionKind = resolveSyncSessionKind(nowMs);
  return {
    id: crypto.randomUUID(),
    status: "finalizing",
    observation: {
      nowMs,
      sessionKind,
      extendedSession: isExtendedSyncSession(sessionKind),
      observationSessionFields: isLiveSurveillanceSessionKind(sessionKind),
      syncedAt: new Date(nowMs).toISOString(),
      syncRunId,
    },
    allTickers: [],
    gainers: [],
    losers: [],
    chunkSize: 2200,
    nextChunkIndex: 7,
    totalChunks: 7,
    merged: emptyChunkArtifacts(),
    leaseToken: null,
    leaseExpiresMs: null,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    nhlBaselineLoaded: false,
    nhlBaselineSnapshot: null,
    stateVersion: 0,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: crypto.randomUUID(),
    finalizeLeaseExpiresMs: nowMs + 60_000,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
    ...overrides,
  };
}

Deno.test("abort diagnostics: prior_generation_retained stores reason and tab evidence", async () => {
  const store = new MemorySyncStagingStore();
  const job = baseJob({});
  store.seedJob(job);
  const prior: TabEvaluationEvidenceMap = {
    gappers: {
      status: "evaluated",
      universe_count: 100,
      volume_positive_count: 50,
      gap_calculable_count: 40,
      no_prior_session_count: 10,
      unresolved_gap_input_count: 0,
      qualified_count: 2,
      selected_count: 2,
    },
  };
  const next: TabEvaluationEvidenceMap = {
    gappers: {
      status: "prerequisite_unavailable",
      universe_count: 100,
      volume_positive_count: 50,
      gap_calculable_count: 0,
      no_prior_session_count: 0,
      unresolved_gap_input_count: 50,
      qualified_count: 0,
      selected_count: 0,
      reason: "prior_close_gap_inputs_unavailable",
    },
  };
  const detail = buildPriorGenerationRetentionAbortDetail({
    priorEvidence: prior,
    nextEvidence: next,
    priorSyncedAt: "2026-10-30T17:55:00.000Z",
    candidateGenerationId: job.id,
    candidateSyncRunId: job.observation.syncRunId,
  });
  await store.abortJob(job.id, Date.now(), detail);
  const stored = await store.get(job.id);
  assertExists(stored);
  assertEquals(stored.status, "aborted");
  assertEquals(stored.abortReason, "prior_generation_retained");
  const evidence = stored.abortEvidence as Record<string, unknown>;
  assertEquals(evidence.prior_synced_at, "2026-10-30T17:55:00.000Z");
  const tabs = evidence.tabs as Array<{ tab: string; triggered_preservation: boolean }>;
  assertEquals(tabs.find((t) => t.tab === "gappers")?.triggered_preservation, true);
  assertEquals(tabs.find((t) => t.tab === "gainers_losers")?.triggered_preservation, false);
});

Deno.test("abort diagnostics: newer_generation_live stores reason without preservation tabs", async () => {
  const store = new MemorySyncStagingStore();
  const job = baseJob({});
  store.seedJob(job);
  const detail = buildNewerGenerationLiveAbortDetail({
    candidateGenerationId: job.id,
    candidateSyncRunId: job.observation.syncRunId,
  });
  await store.abortJob(job.id, Date.now(), detail);
  const stored = await store.get(job.id);
  assertExists(stored);
  assertEquals(stored.abortReason, "newer_generation_live");
  assertEquals(stored.abortEvidence?.tabs, undefined);
});

Deno.test("abort diagnostics: published job is not overwritten by stale abort", async () => {
  const store = new MemorySyncStagingStore();
  const job = baseJob({ status: "published", publishRowsInserted: 108 });
  store.seedJob(job);
  await store.abortJob(job.id, Date.now(), buildNewerGenerationLiveAbortDetail({
    candidateGenerationId: job.id,
    candidateSyncRunId: job.observation.syncRunId,
  }));
  const stored = await store.get(job.id);
  assertEquals(stored?.status, "published");
  assertEquals(stored?.abortReason, null);
});

Deno.test("abort diagnostics: continue_last_error stays separate from abort_reason", async () => {
  const store = new MemorySyncStagingStore();
  const job = baseJob({ status: "chunking" });
  store.seedJob(job);
  await store.recordContinueDispatch({
    jobId: job.id,
    action: "continue",
    ok: false,
    error: "http_503",
    nowMs: Date.now(),
  });
  await store.abortJob(job.id, Date.now(), buildNewerGenerationLiveAbortDetail({
    candidateGenerationId: job.id,
    candidateSyncRunId: job.observation.syncRunId,
  }));
  const stored = await store.get(job.id);
  assertEquals(stored?.continueLastError, "http_503");
  assertEquals(stored?.abortReason, "newer_generation_live");
});

Deno.test("abort diagnostics: serialize round-trip preserves abort columns", () => {
  const job = baseJob({
    status: "aborted",
    abortReason: "prior_generation_retained",
    abortEvidence: { candidate_generation_id: "abc" },
  });
  const roundTripped = jobInsertRowJsonRoundTrip(job);
  assertEquals(roundTripped.abortReason, "prior_generation_retained");
  assertEquals(roundTripped.abortEvidence?.candidate_generation_id, "abc");
});
