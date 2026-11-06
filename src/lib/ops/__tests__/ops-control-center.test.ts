import { describe, expect, it, vi } from "vitest";
import { assessFreshness, resolveSessionContext, type SessionContext } from "@/lib/ops/freshness";
import { redactSecrets, safeDisplayText } from "@/lib/ops/redact";
import {
  buildPublicationOpsView,
  classifyGenerationJob,
  classifyRuntimeFailure,
  type FeedStateOpsRow,
  type GenerationJobOpsRecord,
} from "@/lib/ops/scanner";
import { buildWorkerOpsView, type RadarFeedOpsRow } from "@/lib/ops/worker";
import {
  classifyAttestedRuntime,
  classifyFrontendBuild,
  classifySourceSync,
  parseAttestation,
} from "@/lib/ops/release";
import { computeOverallHealth, type OpsComponentSummary } from "@/lib/ops/status";
import { buildOpsSnapshot, type OpsSnapshotInputs } from "@/lib/ops/snapshot";
import { loadAttestations, readSourceSync, type SourceResult } from "@/lib/ops/sources";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

// Fri 2026-11-06. 10:30 ET = 15:30Z (EST, UTC-5).
const RTH_NOW = Date.parse("2026-11-06T15:30:00Z");
// Fri 2026-11-06 05:00 ET premarket.
const PRE_NOW = Date.parse("2026-11-06T10:00:00Z");
// Sat 2026-11-07 12:00 ET.
const WEEKEND_NOW = Date.parse("2026-11-07T17:00:00Z");

const iso = (ms: number) => new Date(ms).toISOString();
const ctx = (nowMs: number, calendarVerified = false): SessionContext => ({
  ...resolveSessionContext(nowMs),
  calendarVerified,
});

function feedRow(over: Partial<FeedStateOpsRow> = {}): FeedStateOpsRow {
  const evaluated = { status: "evaluated", universe_count: 100, qualified_count: 5, selected_count: 5 };
  return {
    state_key: "current",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    status: "available",
    synced_at: iso(RTH_NOW - 5 * 60_000),
    provider_as_of_min: iso(RTH_NOW - 25 * 60_000),
    provider_as_of_max: iso(RTH_NOW - 18 * 60_000),
    rows_inserted: 85,
    tab_counts: { day_trade_radar: 5, gappers: 5, volume_spikes: 5, gainers_losers: 20, unusual_volume: 5, new_highs_lows: 10 },
    nhl_baseline_status: "available",
    tab_evaluation_evidence: {
      day_trade_radar: evaluated,
      gappers: {
        status: "evaluated",
        universe_count: 100,
        volume_positive_count: 80,
        gap_calculable_count: 70,
        qualified_count: 5,
        selected_count: 5,
      },
      volume_spikes: evaluated,
      gainers_losers: evaluated,
      unusual_volume: evaluated,
      new_highs_lows: {
        status: "evaluated",
        baseline_status: "available",
        baseline_quote_count: 100,
        universe_count: 100,
        selected_count: 10,
      },
    },
    updated_at: iso(RTH_NOW - 5 * 60_000),
    ...over,
  };
}

function job(over: Partial<GenerationJobOpsRecord> = {}): GenerationJobOpsRecord {
  return {
    id: "j1",
    sync_run_id: "09346799-0000-4000-8000-000000000000",
    status: "published",
    next_chunk_index: 7,
    total_chunks: 7,
    lease_expires_at: null,
    finalize_lease_expires_at: null,
    continue_last_at: null,
    continue_last_error: null,
    abort_reason: null,
    publish_rows_inserted: 85,
    publish_rpc_recorded_at: iso(RTH_NOW - 60_000),
    created_at: iso(RTH_NOW - 10 * 60_000),
    updated_at: iso(RTH_NOW - 60_000),
    ...over,
  };
}

function radarRow(over: Partial<RadarFeedOpsRow> = {}): RadarFeedOpsRow {
  return {
    state_key: "current",
    status: "available",
    session_kind: "market",
    session_date: "2026-11-06",
    updated_at: iso(RTH_NOW - 30_000),
    synced_at: iso(RTH_NOW - 30_000),
    v2_synced_at: null,
    last_receive_at: iso(RTH_NOW - 30_000),
    last_provider_event_at: iso(RTH_NOW - 16 * 60_000),
    feed_stale: false,
    feed_telemetry_stale: false,
    feed_connection_state: "subscribed",
    feed_last_message_at: iso(RTH_NOW - 20_000),
    feed_latency_ms: 15 * 60_000,
    market_data_provider: "polygon",
    market_data_feed_mode: "delayed",
    candidate_count: 40,
    ...over,
  };
}

const comp = (over: Partial<OpsComponentSummary>): OpsComponentSummary => ({
  id: "x",
  title: "X",
  status: "healthy",
  explanation: "",
  lastObservedAt: null,
  source: { label: "test" },
  userImpact: true,
  ...over,
});

describe("overall health roll-up", () => {
  it("scanner failure is not obscured by healthy services", () => {
    const overall = computeOverallHealth([
      comp({ id: "scanner", title: "Scanner publication", status: "failing" }),
      comp({ id: "worker", title: "Worker", status: "healthy" }),
      comp({ id: "sync", title: "Sync", status: "healthy", userImpact: false }),
    ]);
    expect(overall.status).toBe("failing");
    expect(overall.headline).toContain("Scanner publication");
  });

  it("unknown user-impact evidence never rolls up as healthy", () => {
    const overall = computeOverallHealth([
      comp({ id: "scanner", status: "unknown" }),
      comp({ id: "worker", status: "healthy" }),
    ]);
    expect(overall.status).toBe("unknown");
  });

  it("stale telemetry blocks a healthy roll-up", () => {
    expect(computeOverallHealth([comp({ status: "stale_telemetry" }), comp({ status: "healthy" })]).status).toBe(
      "stale_telemetry",
    );
  });

  it("unknown provenance alone does not mark the platform unknown", () => {
    const overall = computeOverallHealth([
      comp({ status: "healthy" }),
      comp({ id: "prov", status: "unknown", userImpact: false }),
    ]);
    expect(overall.status).toBe("healthy");
  });
});

describe("session-aware freshness", () => {
  it("closed weekend session is not applicable, not an outage", () => {
    const r = assessFreshness({ context: ctx(WEEKEND_NOW), observedAtIso: iso(WEEKEND_NOW - 40 * 3_600_000), staleAfterMs: 20 * 60_000 });
    expect(r.status).toBe("not_applicable");
  });

  it("missing timestamp is unknown", () => {
    expect(assessFreshness({ context: ctx(RTH_NOW), observedAtIso: null, staleAfterMs: 1 }).status).toBe("unknown");
  });

  it("delayed provider data within allowance is healthy", () => {
    const r = assessFreshness({
      context: ctx(RTH_NOW),
      observedAtIso: iso(RTH_NOW - 30 * 60_000),
      staleAfterMs: 20 * 60_000,
      providerDelayMs: 15 * 60_000,
    });
    expect(r.status).toBe("healthy");
  });

  it("the same age without delay allowance is degraded", () => {
    const r = assessFreshness({ context: ctx(RTH_NOW), observedAtIso: iso(RTH_NOW - 30 * 60_000), staleAfterMs: 20 * 60_000 });
    expect(r.status).toBe("degraded");
  });

  it("genuinely stale data is failing only when the calendar is verified", () => {
    const input = { observedAtIso: iso(RTH_NOW - 3 * 3_600_000), staleAfterMs: 20 * 60_000, providerDelayMs: 15 * 60_000 };
    expect(assessFreshness({ ...input, context: ctx(RTH_NOW, true) }).status).toBe("failing");
    const unverified = assessFreshness({ ...input, context: ctx(RTH_NOW, false) });
    expect(unverified.status).toBe("degraded");
    expect(unverified.explanation).toMatch(/holiday/i);
  });

  it("resolves premarket from the ET clock", () => {
    expect(resolveSessionContext(PRE_NOW).session).toBe("pre-market");
    expect(resolveSessionContext(WEEKEND_NOW).session).toBe("closed");
  });
});

describe("scanner publication view", () => {
  it("fresh generation with full evidence is healthy and all tabs current", () => {
    const v = buildPublicationOpsView(feedRow(), ctx(RTH_NOW));
    expect(v.status).toBe("healthy");
    expect(v.tabs.every((t) => t.state === "current")).toBe(true);
    expect(v.providerData.status).toBe("healthy");
  });

  it("tab-level freshness differs: gappers prerequisite unavailable, NHL missing evidence", () => {
    const row = feedRow();
    const ev = row.tab_evaluation_evidence as Record<string, unknown>;
    ev.gappers = {
      status: "prerequisite_unavailable",
      universe_count: 100,
      volume_positive_count: 80,
      gap_calculable_count: 40,
      unresolved_gap_input_count: 12,
      split_scale_suppressed_count: 3,
      qualified_count: 0,
      selected_count: 0,
      reason: "gap_input_coverage_incomplete",
    };
    delete ev.new_highs_lows;
    const v = buildPublicationOpsView(row, ctx(RTH_NOW));
    const gappers = v.tabs.find((t) => t.tab === "gappers")!;
    const nhl = v.tabs.find((t) => t.tab === "new_highs_lows")!;
    expect(gappers.state).toBe("prerequisite_unavailable");
    expect(gappers.status).toBe("degraded");
    expect(gappers.explanation).toContain("gap_input_coverage_incomplete");
    expect(gappers.explanation).toContain("Unresolved gap inputs: 12");
    expect(nhl.state).toBe("unverified");
    expect(nhl.status).toBe("unknown");
    expect(v.tabs.find((t) => t.tab === "gainers_losers")!.state).toBe("current");
    expect(v.status).toBe("degraded");
  });

  it("publication-only evidence is not reported as a verified evaluation", () => {
    const row = feedRow();
    (row.tab_evaluation_evidence as Record<string, unknown>).unusual_volume = { status: "publication_confirmed", published_count: 5 };
    const t = buildPublicationOpsView(row, ctx(RTH_NOW)).tabs.find((x) => x.tab === "unusual_volume")!;
    expect(t.state).toBe("publication_only");
    expect(t.status).toBe("unknown");
  });

  it("an old retained generation marks every tab stale during a live session", () => {
    const row = feedRow({ synced_at: iso(RTH_NOW - 90 * 60_000), provider_as_of_max: iso(RTH_NOW - 100 * 60_000) });
    const v = buildPublicationOpsView(row, ctx(RTH_NOW));
    expect(v.status).toBe("degraded");
    expect(v.tabs.every((t) => t.state === "stale")).toBe(true);
  });

  it("weekend publication is not applicable", () => {
    const row = feedRow({ synced_at: iso(WEEKEND_NOW - 20 * 3_600_000) });
    expect(buildPublicationOpsView(row, ctx(WEEKEND_NOW)).status).toBe("not_applicable");
  });
});

describe("runtime failure classification", () => {
  it("explicit CPU wording is confirmed CPU exhaustion", () => {
    expect(classifyRuntimeFailure("CPU time soft limit reached")!.kind).toBe("cpu_exhaustion_confirmed");
  });
  it("HTTP 546 is an Edge resource limit, not a generic error", () => {
    expect(classifyRuntimeFailure("finalize dispatch failed: http_546")!.kind).toBe("edge_resource_limit_546");
    expect(classifyRuntimeFailure("WORKER_LIMIT")!.kind).toBe("edge_resource_limit_546");
  });
  it("generic HTTP 500 is never CPU exhaustion", () => {
    const c = classifyRuntimeFailure("continue returned status 500")!;
    expect(c.kind).toBe("http_error");
    expect(c.httpStatus).toBe(500);
  });
  it("wall-clock timeout is never CPU exhaustion", () => {
    expect(classifyRuntimeFailure("continue fetch timed out after 150000ms")!.kind).toBe("wall_clock_timeout");
  });
  it("empty error is null", () => {
    expect(classifyRuntimeFailure(null)).toBeNull();
  });
});

describe("generation job classification", () => {
  it("published with publish RPC rows is persisted", () => {
    const v = classifyGenerationJob(job(), RTH_NOW);
    expect(v.outcome).toBe("published_persisted");
    expect(v.persisted).toBe(true);
  });
  it("published without a publish RPC record is unconfirmed, not healthy", () => {
    const v = classifyGenerationJob(job({ publish_rpc_recorded_at: null, publish_rows_inserted: null }), RTH_NOW);
    expect(v.outcome).toBe("published_unconfirmed");
    expect(v.status).toBe("unknown");
  });
  it("7/7 chunks with failed finalize is failing", () => {
    const v = classifyGenerationJob(job({ status: "failed", continue_last_error: "http_546", publish_rpc_recorded_at: null }), RTH_NOW);
    expect(v.outcome).toBe("finalize_failed_after_all_chunks");
    expect(v.allChunksComplete).toBe(true);
    expect(v.status).toBe("failing");
    expect(v.failure!.kind).toBe("edge_resource_limit_546");
  });
  it("finalizing with an expired lease is stranded", () => {
    const v = classifyGenerationJob(
      job({ status: "finalizing", finalize_lease_expires_at: iso(RTH_NOW - 60_000), publish_rpc_recorded_at: null }),
      RTH_NOW,
    );
    expect(v.outcome).toBe("stranded_finalizing");
    expect(v.status).toBe("failing");
  });
  it("finalizing with an active lease is in progress", () => {
    const v = classifyGenerationJob(job({ status: "finalizing", finalize_lease_expires_at: iso(RTH_NOW + 60_000) }), RTH_NOW);
    expect(v.outcome).toBe("finalizing");
  });
  it("prior generation retained is distinguished from new publication", () => {
    const v = classifyGenerationJob(
      job({ status: "aborted", abort_reason: "prior_generation_retained", publish_rpc_recorded_at: null }),
      RTH_NOW,
    );
    expect(v.outcome).toBe("prior_generation_retained");
    expect(v.status).toBe("degraded");
    expect(v.persisted).toBe(false);
  });
  it("chunking with expired lease is stalled", () => {
    const v = classifyGenerationJob(
      job({ status: "chunking", next_chunk_index: 3, lease_expires_at: iso(RTH_NOW - 1000), publish_rpc_recorded_at: null }),
      RTH_NOW,
    );
    expect(v.outcome).toBe("chunking_stalled");
    expect(v.chunksCompleted).toBe(3);
  });
});

describe("Fly worker telemetry", () => {
  it("fresh subscribed delayed feed is healthy", () => {
    const v = buildWorkerOpsView(radarRow(), ctx(RTH_NOW));
    expect(v.status).toBe("healthy");
    expect(v.providerStatus).toBe("healthy");
  });
  it("an old checkpoint is stale telemetry, never a current heartbeat", () => {
    const v = buildWorkerOpsView(radarRow({ updated_at: iso(RTH_NOW - 2 * 3_600_000) }), ctx(RTH_NOW));
    expect(v.status).toBe("stale_telemetry");
  });
  it("worker-reported telemetry staleness is surfaced", () => {
    expect(buildWorkerOpsView(radarRow({ feed_telemetry_stale: true }), ctx(RTH_NOW)).status).toBe("stale_telemetry");
  });
  it("disconnected feed during a live session is failing", () => {
    expect(buildWorkerOpsView(radarRow({ feed_connection_state: "disconnected" }), ctx(RTH_NOW)).status).toBe("failing");
  });
  it("missing connection state is unknown, not healthy", () => {
    expect(buildWorkerOpsView(radarRow({ feed_connection_state: null }), ctx(RTH_NOW)).status).toBe("unknown");
  });
});

describe("source parity vs runtime identity", () => {
  const sha = (c: string) => c.repeat(40);
  it("integration containing main is healthy source sync", () => {
    const v = classifySourceSync({
      main: { sha: sha("a"), committedAt: null },
      integration: { sha: sha("b"), committedAt: null },
      behindBy: 0,
      aheadBy: 3,
      latestRun: null,
    });
    expect(v.status).toBe("healthy");
    expect(v.integrationContainsMain).toBe(true);
  });
  it("integration behind main is degraded", () => {
    const v = classifySourceSync({
      main: { sha: sha("a"), committedAt: null },
      integration: { sha: sha("b"), committedAt: null },
      behindBy: 2,
      aheadBy: 0,
      latestRun: null,
    });
    expect(v.status).toBe("degraded");
  });
  it("source parity does not make Edge runtime identity verified", () => {
    const att = parseAttestation("a.json", {
      kind: "deployment_attestation",
      manifest_id: "m",
      component_id: "sync_screener_data_edge",
      recorded_at: "2026-11-06T15:00:00.000Z",
      observer: "manual_import",
      observed: { edge_function_version: 516, image_digest: null },
    })!;
    const r = classifyAttestedRuntime("Edge", [att]);
    expect(r.status).toBe("unknown");
    expect(r.reported).toBe("v516");
  });
  it("frontend without a build SHA is not configured", () => {
    expect(classifyFrontendBuild(null, sha("a")).status).toBe("not_configured");
  });
  it("loads the real Batch 210 attestation from git", () => {
    const records = loadAttestations();
    expect(records.some((r) => r.componentId === "sync_screener_data_edge" && r.edgeFunctionVersion === 516)).toBe(true);
  });
});

describe("unavailable integrations and partial failures", () => {
  const unavailable = <T,>(): SourceResult<T> => ({
    state: "unavailable",
    reason: "no_read_path",
    detail: "x",
    fetchedAt: iso(RTH_NOW),
  });

  it("GitHub rate limit resolves to unavailable without throwing", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 403, headers: { "x-ratelimit-remaining": "0" } }));
    const r = await readSourceSync(fetchImpl as unknown as typeof fetch);
    expect(r.state).toBe("unavailable");
    if (r.state === "unavailable") expect(r.reason).toBe("rate_limited");
  });

  it("network failure resolves to unavailable without throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });
    const r = await readSourceSync(fetchImpl as unknown as typeof fetch);
    expect(r.state).toBe("unavailable");
  });

  it("snapshot survives partial failure and keeps scanner evidence", () => {
    const inputs: OpsSnapshotInputs = {
      context: ctx(RTH_NOW),
      feedState: { state: "ok", data: feedRow(), fetchedAt: iso(RTH_NOW) },
      radarFeed: unavailable(),
      jobs: unavailable(),
      edgeLogs: unavailable(),
      sourceSync: unavailable(),
      attestations: [],
      frontendBuildSha: null,
    };
    const s = buildOpsSnapshot(inputs);
    expect(s.components.find((c) => c.id === "scanner")!.status).toBe("healthy");
    expect(s.components.find((c) => c.id === "worker")!.status).toBe("unknown");
    expect(s.components.find((c) => c.id === "edge")!.status).toBe("unknown");
    expect(s.components.find((c) => c.id === "source_sync")!.status).toBe("unknown");
    expect(s.overall.status).toBe("unknown");
  });

  it("all sources unavailable is unknown, not healthy", () => {
    const s = buildOpsSnapshot({
      context: ctx(RTH_NOW),
      feedState: unavailable(),
      radarFeed: unavailable(),
      jobs: unavailable(),
      edgeLogs: unavailable(),
      sourceSync: unavailable(),
      attestations: [],
      frontendBuildSha: null,
    });
    expect(s.overall.status).toBe("unknown");
    expect(s.components.every((c) => c.status !== "healthy")).toBe(true);
  });
});

describe("secret redaction", () => {
  it("redacts JWTs, bearer tokens, API keys and connection strings", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abcdefghijklmnop";
    const text =
      `auth ${jwt} Bearer abcdefghijklmnop12345 https://api.polygon.io/v2?apiKey=SECRETKEY123 ` +
      "ghp_abcdefghijklmnopqrstuvwxyz123456 sk_live_abcdefghijkl postgres://user:pw@db.host/postgres " +
      "SYNC_SECRET=topsecretvalue";
    const out = redactSecrets(text);
    expect(out).not.toContain(jwt);
    expect(out).not.toContain("abcdefghijklmnop12345");
    expect(out).not.toContain("SECRETKEY123");
    expect(out).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
    expect(out).not.toContain("sk_live_abcdefghijkl");
    expect(out).not.toContain("user:pw");
    expect(out).not.toContain("topsecretvalue");
  });
  it("keeps commit SHAs and generation ids readable", () => {
    const text = "sha f2a3cdae0000000000000000000000000000abcd generation 09346799-0000-4000-8000-000000000000";
    expect(redactSecrets(text)).toBe(text);
  });
  it("runtime failure messages are redacted before display", () => {
    const c = classifyRuntimeFailure("status 500 Authorization: Bearer abcdefghijklmnopqrstu");
    expect(c!.message).not.toContain("abcdefghijklmnopqrstu");
  });
  it("bounds long values", () => {
    expect(safeDisplayText("x".repeat(1000), 10)!.length).toBe(11);
  });
});
