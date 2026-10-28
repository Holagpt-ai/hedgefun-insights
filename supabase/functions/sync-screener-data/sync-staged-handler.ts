/**
 * Staged execution entry for sync-screener-data (Batch 190).
 * Monolithic path remains in handler.ts when SCREENER_SYNC_STAGED=0.
 */

import type { FetchLike } from "../_shared/screeners/provider.ts";
import type { EnvReader } from "../_shared/screeners/auth.ts";
import {
  buildStagedJobFromUniverse,
  runStagedSyncStep,
  type StagedStepResult,
} from "../_shared/screeners/sync-orchestrator.ts";
import type { PolicyExclusionEvidence } from "../_shared/screeners/baseline-coverage.ts";
import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "../_shared/screeners/baseline-coverage.ts";
import type { NhlBaselineQuote } from "../_shared/screeners/new-highs-lows.ts";
import type { SyncStagingStore } from "../_shared/screeners/sync-staging-memory.ts";
import type { StagedSyncRequest } from "../_shared/screeners/sync-staging-types.ts";
import type { DbClient, SyncDeps } from "./handler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type StagedChunkContext = {
  nhlBaselines: ReadonlyMap<string, NhlBaselineQuote>;
  policyExclusions: PolicyExclusionEvidence;
};

export type StagedHandlerDeps = SyncDeps & {
  stagingStore: SyncStagingStore;
  invokeContinue?: (body: StagedSyncRequest) => void;
  finalizeStagedGeneration?: (generationId: string) => Promise<Response>;
};

export async function handleStagedSyncStart(
  deps: StagedHandlerDeps,
  parsedBody: StagedSyncRequest,
  startJob: Parameters<typeof runStagedSyncStep>[1],
  chunkContext: StagedChunkContext = {
    nhlBaselines: new Map(),
    policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
  },
): Promise<Response> {
  const step = await runStagedSyncStep(parsedBody, startJob, {
    nowMs: deps.nowMs ?? (() => Date.now()),
    newLeaseToken: () => crypto.randomUUID(),
    store: deps.stagingStore,
    nhlBaselines: chunkContext.nhlBaselines,
    policyExclusions: chunkContext.policyExclusions,
    scheduleContinue: (body) => {
      if (deps.invokeContinue) deps.invokeContinue(body);
    },
  });

  if (step.phase === "finalizing") {
    const fin = await deps.finalizeStagedGeneration?.(step.generation_id);
    if (fin) return fin;
    return json({
      ok: false,
      error: "finalize_pending",
      generation_id: step.generation_id,
    }, 503);
  }

  if (step.phase === "skipped") {
    const status = step.reason === "generation_in_progress" ? 409 : 503;
    return json({ ok: false, staged: step, reason: step.reason }, status);
  }

  return json({ ok: true, staged: step });
}

export async function handleStagedSyncRequest(
  deps: StagedHandlerDeps,
  parsedBody: StagedSyncRequest,
): Promise<Response> {
  return handleStagedSyncStart(deps, parsedBody, null);
}

export async function parseStagedSyncBody(req: Request): Promise<StagedSyncRequest> {
  try {
    const text = await req.text();
    if (!text.trim()) return { action: "cron" };
    return JSON.parse(text) as StagedSyncRequest;
  } catch {
    return { action: "cron" };
  }
}

export function createContinueInvoker(
  deps: { env: EnvReader; fetch: FetchLike },
  functionUrl: string,
): (body: StagedSyncRequest) => void {
  const secret = deps.env("SYNC_SECRET") ?? "";
  return (body) => {
    if (!secret) return;
    void deps.fetch(functionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).catch(() => {});
  };
}

export type { StagedStepResult, DbClient };
