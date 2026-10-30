import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { finalizeLeaseActive, leaseActive } from "./sync-staging-cas.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import { isExtendedSyncSession } from "./session-sync-context.ts";
import { isLiveSurveillanceSessionKind } from "./screener-session.ts";
import { stagedJobNeedsResume } from "./sync-staging-resume.ts";
import { emptyChunkArtifacts, SCREENER_SYNC_LEASE_MS, type StagedGenerationJob } from "./sync-staging-types.ts";

function baseJob(overrides: Partial<StagedGenerationJob>): StagedGenerationJob {
  const nowMs = Date.parse("2026-10-30T20:15:00.000Z");
  const sessionKind = resolveSyncSessionKind(nowMs);
  return {
    id: "ce0593d4-9259-441b-adcd-91b484d432b9",
    status: "finalizing",
    observation: {
      nowMs,
      sessionKind,
      extendedSession: isExtendedSyncSession(sessionKind),
      observationSessionFields: isLiveSurveillanceSessionKind(sessionKind),
      syncedAt: "2026-10-30T20:15:00.000Z",
      syncRunId: "ac60e2a0-5bf7-430f-9a62-3deaa6c34570",
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
    createdAtMs: nowMs - 60_000,
    updatedAtMs: nowMs,
    nhlBaselineLoaded: true,
    nhlBaselineSnapshot: null,
    stateVersion: 7,
    continueLastAtMs: nowMs,
    continueLastError: "http_500",
    finalizeLeaseToken: "11111111-1111-1111-1111-111111111111",
    finalizeLeaseExpiresMs: nowMs + SCREENER_SYNC_LEASE_MS,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
    ...overrides,
  };
}

Deno.test("resume: finalizing with active lease and no dispatch error waits", () => {
  const nowMs = Date.parse("2026-10-30T20:16:00.000Z");
  const job = baseJob({ continueLastError: null });
  assertEquals(finalizeLeaseActive(job, nowMs), true);
  assertEquals(stagedJobNeedsResume(job, nowMs), false);
});

Deno.test("resume: finalizing after http_500 dispatch error is resumable", () => {
  const nowMs = Date.parse("2026-10-30T20:16:00.000Z");
  const job = baseJob({});
  assertEquals(stagedJobNeedsResume(job, nowMs), true);
});

Deno.test("resume: chunking with expired chunk lease is resumable", () => {
  const nowMs = Date.parse("2026-10-30T20:16:00.000Z");
  const job = baseJob({
    status: "chunking",
    nextChunkIndex: 3,
    finalizeLeaseToken: null,
    finalizeLeaseExpiresMs: null,
    continueLastError: null,
    leaseToken: "22222222-2222-2222-2222-222222222222",
    leaseExpiresMs: nowMs - 1,
  });
  assertEquals(leaseActive(job, nowMs), false);
  assertEquals(stagedJobNeedsResume(job, nowMs), true);
});
