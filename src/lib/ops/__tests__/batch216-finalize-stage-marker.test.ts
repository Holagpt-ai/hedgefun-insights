import { describe, expect, it, vi } from "vitest";
import { parseOpsDiagnostics } from "@/lib/ops/diagnostics";
import {
  classifyGenerationJob,
  classifyRuntimeFailure,
  parseFinalizeStageProgress,
  type FeedStateOpsRow,
  type GenerationJobOpsRecord,
} from "@/lib/ops/scanner";
import { buildOpsSnapshot, type OpsSnapshotInputs } from "@/lib/ops/snapshot";
import type { SourceResult } from "@/lib/ops/sources";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const RTH_NOW = Date.parse("2026-11-06T15:30:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
const U = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function job(over: Partial<GenerationJobOpsRecord> = {}): GenerationJobOpsRecord {
  return {
    id: U(216),
    sync_run_id: U(1216),
    status: "finalizing",
    next_chunk_index: 7,
    total_chunks: 7,
    lease_expires_at: null,
    finalize_lease_expires_at: iso(RTH_NOW + 60_000),
    continue_last_at: iso(RTH_NOW - 5_000),
    continue_last_error: null,
    abort_reason: null,
    publish_rows_inserted: null,
    publish_rpc_recorded_at: null,
    created_at: iso(RTH_NOW - 10 * 60_000),
    updated_at: iso(RTH_NOW - 5_000),
    ...over,
  };
}

function feedRow(syncedAtMs = RTH_NOW - 5 * 60_000): FeedStateOpsRow {
  return {
    state_key: "current",
    sync_run_id: U(1),
    status: "available",
    synced_at: iso(syncedAtMs),
    provider_as_of_min: iso(syncedAtMs - 20 * 60_000),
    provider_as_of_max: iso(syncedAtMs - 13 * 60_000),
    rows_inserted: 113,
    tab_counts: {
      day_trade_radar: 5,
      gappers: 5,
      volume_spikes: 5,
      gainers_losers: 20,
      unusual_volume: 5,
      new_highs_lows: 10,
    },
    nhl_baseline_status: "available",
    tab_evaluation_evidence: null,
    updated_at: iso(syncedAtMs),
  };
}

const unavailable = <T,>(): SourceResult<T> => ({
  state: "unavailable",
  reason: "no_read_path",
  detail: "test",
  fetchedAt: iso(RTH_NOW),
});

describe("Batch 216.2 finalize stage marker ops compatibility", () => {
  it("treats a standalone finalize_stage marker as progress, not a runtime failure", () => {
    expect(parseFinalizeStageProgress("finalize_stage:atomic_publish")).toBe("atomic_publish");
    expect(classifyRuntimeFailure("finalize_stage:atomic_publish")).toBeNull();

    const view = classifyGenerationJob(
      job({ continue_last_error: "finalize_stage:atomic_publish" }),
      RTH_NOW,
    );
    expect(view.outcome).toBe("finalizing");
    expect(view.status).toBe("healthy");
    expect(view.failure).toBeNull();
    expect(view.explanation).toContain("progress: atomic_publish");
    expect(view.explanation).not.toMatch(/Runtime error|failing/i);
  });

  it("keeps http_546 with an embedded stage marker as an Edge resource-limit failure", () => {
    const merged = "http_546:finalize_stage:claim_finalize_lease";
    expect(parseFinalizeStageProgress(merged)).toBeNull();
    const failure = classifyRuntimeFailure(merged)!;
    expect(failure.kind).toBe("edge_resource_limit_546");
    expect(failure.httpStatus).toBe(546);
    expect(failure.message).toContain("finalize_stage:claim_finalize_lease");

    const view = classifyGenerationJob(
      job({
        status: "failed",
        continue_last_error: merged,
      }),
      RTH_NOW,
    );
    expect(view.outcome).toBe("finalize_failed_after_all_chunks");
    expect(view.status).toBe("failing");
    expect(view.failure!.kind).toBe("edge_resource_limit_546");
    expect(view.failure!.message).toContain("finalize_stage:claim_finalize_lease");
  });

  it("retains failed and aborted classifications when real errors are present", () => {
    const failed = classifyGenerationJob(
      job({
        status: "failed",
        continue_last_error: "finalize_failed:build_rows:type_error",
      }),
      RTH_NOW,
    );
    expect(failed.outcome).toBe("finalize_failed_after_all_chunks");
    expect(failed.status).toBe("failing");
    expect(failed.failure!.kind).toBe("other");

    const aborted = classifyGenerationJob(
      job({
        status: "aborted",
        abort_reason: "prior_generation_retained",
        continue_last_error: null,
      }),
      RTH_NOW,
    );
    expect(aborted.outcome).toBe("prior_generation_retained");
    expect(aborted.status).toBe("degraded");
    expect(aborted.failure).toBeNull();
  });

  it("does not change published-generation behavior", () => {
    const published = classifyGenerationJob(
      job({
        status: "published",
        continue_last_error: null,
        publish_rows_inserted: 113,
        publish_rpc_recorded_at: iso(RTH_NOW - 30_000),
        finalize_lease_expires_at: null,
      }),
      RTH_NOW,
    );
    expect(published.outcome).toBe("published_persisted");
    expect(published.status).toBe("healthy");
    expect(published.failure).toBeNull();
  });

  it("does not surface a healthy progress marker as the latest Edge failure in the snapshot", () => {
    const raw = {
      schema_version: 1,
      observed_at: iso(RTH_NOW),
      job_limit: 10,
      stranded_finalizing_count: 0,
      jobs: [
        {
          id: U(216),
          sync_run_id: U(1216),
          status: "finalizing",
          next_chunk_index: 7,
          total_chunks: 7,
          lease_expires_at: null,
          finalize_lease_expires_at: iso(RTH_NOW + 60_000),
          continue_last_at: iso(RTH_NOW - 5_000),
          continue_last_error: "finalize_stage:build_rows",
          abort_reason: null,
          publish_rows_inserted: null,
          publish_rpc_recorded_at: null,
          created_at: iso(RTH_NOW - 10 * 60_000),
          updated_at: iso(RTH_NOW - 5_000),
        },
      ],
      calendar: { today_et: "2026-11-06", loaded: true, exceptions: [] },
    };
    const diagnostics = parseOpsDiagnostics(raw)!;
    const inputs: OpsSnapshotInputs = {
      nowMs: RTH_NOW,
      feedState: { state: "ok", data: feedRow(), fetchedAt: iso(RTH_NOW) },
      radarFeed: unavailable(),
      diagnostics: { state: "ok", data: diagnostics, fetchedAt: iso(RTH_NOW) },
      edgeLogs: unavailable(),
      sourceSync: unavailable(),
      attestations: [],
      frontendBuildSha: null,
    };
    const snapshot = buildOpsSnapshot(inputs);
    expect(snapshot.jobs?.[0].failure).toBeNull();
    expect(snapshot.jobs?.[0].status).toBe("healthy");
    const edge = snapshot.components.find((c) => c.id === "edge")!;
    expect(edge.status).toBe("healthy");
    expect(edge.explanation).not.toMatch(/Most recent recorded failure/);
    expect(edge.explanation).toContain("progress: build_rows");
  });
});
