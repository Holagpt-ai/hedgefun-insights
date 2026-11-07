/**
 * Combines adapter results into the six Platform Overview summaries.
 * Pure — tested without network.
 */

import type { SessionContext } from "@/lib/ops/freshness";
import { resolveSessionContextWithCalendar, type OpsDiagnostics } from "@/lib/ops/diagnostics";
import {
  classifyAttestedRuntime,
  classifyFrontendBuild,
  classifySourceSync,
  GITHUB_REPO,
  LOVABLE_INTEGRATION_BRANCH,
  type AttestationRecord,
  type RuntimeIdentityView,
  type SourceSyncObservation,
  type SourceSyncView,
} from "@/lib/ops/release";
import {
  buildPublicationOpsView,
  classifyGenerationJob,
  type FeedStateOpsRow,
  type GenerationJobOpsView,
  type PublicationOpsView,
} from "@/lib/ops/scanner";
import type { SourceResult } from "@/lib/ops/sources";
import { computeOverallHealth, worstStatus, type OpsComponentSummary, type OpsStatus, type OverallHealth } from "@/lib/ops/status";
import { buildWorkerOpsView, type RadarFeedOpsRow, type WorkerOpsView } from "@/lib/ops/worker";

export interface OpsSnapshotInputs {
  nowMs: number;
  feedState: SourceResult<FeedStateOpsRow>;
  radarFeed: SourceResult<RadarFeedOpsRow>;
  /** Batch 213 admin RPC: generation jobs + exception calendar. */
  diagnostics: SourceResult<OpsDiagnostics>;
  edgeLogs: SourceResult<never>;
  sourceSync: SourceResult<SourceSyncObservation>;
  attestations: AttestationRecord[];
  frontendBuildSha: string | null;
}

export interface OpsSnapshot {
  context: SessionContext & { holidayName: string | null; marketStatus: "open" | "closed" | "early_close" };
  diagnostics: OpsDiagnostics | null;
  overall: OverallHealth;
  components: OpsComponentSummary[];
  publication: PublicationOpsView | null;
  jobs: GenerationJobOpsView[] | null;
  worker: WorkerOpsView | null;
  sourceSync: (SourceSyncView & { observation: SourceSyncObservation }) | null;
  runtime: RuntimeIdentityView[];
  inputs: OpsSnapshotInputs;
}

function unavailableText(r: SourceResult<unknown>): string {
  if (r.state === "unavailable") return `Unavailable (${r.reason.replace(/_/g, " ")}): ${r.detail}`;
  if (r.state === "empty") return r.detail;
  return "";
}

function statusForMissing(r: SourceResult<unknown>): OpsStatus {
  if (r.state === "unavailable" && r.reason === "not_configured") return "not_configured";
  return "unknown";
}

export function buildOpsSnapshot(inputs: OpsSnapshotInputs): OpsSnapshot {
  const diagnostics = inputs.diagnostics.state === "ok" ? inputs.diagnostics.data : null;
  const context = resolveSessionContextWithCalendar(inputs.nowMs, diagnostics?.calendar ?? null);
  const components: OpsComponentSummary[] = [];
  const jobs = diagnostics ? diagnostics.jobs.map((j) => classifyGenerationJob(j, context.nowMs)) : null;
  // Newest job that reached a terminal outcome (published / retained / failed).
  const latestTerminal = jobs?.find((j) => j.outcome !== "chunking" && j.outcome !== "finalizing" && j.outcome !== "chunking_stalled") ?? null;

  // A. Scanner publication health -------------------------------------------
  const publication = inputs.feedState.state === "ok" ? buildPublicationOpsView(inputs.feedState.data, context) : null;
  let scannerStatus: OpsStatus = publication?.status ?? statusForMissing(inputs.feedState);
  let scannerExplanation = publication?.explanation ?? unavailableText(inputs.feedState);
  if (
    publication &&
    latestTerminal &&
    (latestTerminal.status === "degraded" || latestTerminal.status === "failing") &&
    (scannerStatus === "healthy" || scannerStatus === "unknown")
  ) {
    // The live feed may still look fresh, but the newest generation did not publish.
    scannerStatus = "degraded";
    scannerExplanation = `Newest generation did not publish: ${latestTerminal.explanation} Serving the prior generation.`;
  }
  components.push({
    id: "scanner",
    title: "Scanner publication",
    status: scannerStatus,
    explanation: scannerExplanation,
    lastObservedAt: publication?.publishedAt ?? null,
    source: { label: "screener_feed_state", detail: "state_key = current (atomic published generation)" },
    userImpact: true,
  });

  // Provider / dataset freshness ---------------------------------------------
  const worker = inputs.radarFeed.state === "ok" ? buildWorkerOpsView(inputs.radarFeed.data, context) : null;
  const providerStatuses: OpsStatus[] = [];
  if (publication) providerStatuses.push(publication.providerData.status);
  if (worker) providerStatuses.push(worker.providerStatus);
  components.push({
    id: "provider",
    title: "Provider data freshness",
    status: providerStatuses.length ? worstStatus(providerStatuses) : "unknown",
    explanation: publication
      ? `Screener provider data: ${publication.providerData.explanation}`
      : worker
      ? `Radar provider events: ${worker.providerExplanation}`
      : "No provider observation timestamps readable.",
    lastObservedAt: publication?.providerObservedAt ?? worker?.lastProviderEventAt ?? null,
    source: { label: "screener_feed_state.provider_as_of_max, radar_v22_feed_state.last_provider_event_at" },
    userImpact: true,
  });

  // Fly worker --------------------------------------------------------------
  components.push({
    id: "worker",
    title: "Fly radar worker",
    status: worker?.status ?? statusForMissing(inputs.radarFeed),
    explanation: worker?.explanation ?? unavailableText(inputs.radarFeed),
    lastObservedAt: worker?.checkpointAt ?? null,
    source: { label: "radar_v22_feed_state", detail: "checkpoint row written by stocksist-radar-v22-worker" },
    userImpact: true,
  });

  // Edge runtime failures ---------------------------------------------------
  const latestFailure = jobs?.find((j) => j.failure !== null) ?? null;
  let edgeStatus: OpsStatus = statusForMissing(inputs.diagnostics);
  let edgeExplanation = `${unavailableText(inputs.diagnostics)} ${unavailableText(inputs.edgeLogs)}`.trim();
  if (jobs && diagnostics) {
    const stranded = diagnostics.strandedFinalizingCount;
    const latest = jobs[0] ?? null;
    if (stranded > 0) {
      edgeStatus = "failing";
      edgeExplanation = `${stranded} job(s) stranded in finalizing with an expired lease.`;
    } else if (!latest) {
      edgeStatus = "unknown";
      edgeExplanation = "No generation jobs recorded.";
    } else {
      edgeStatus = latest.status;
      edgeExplanation = `Latest generation: ${latest.explanation}`;
    }
    if (latestFailure) {
      edgeExplanation += ` Most recent recorded failure (${latestFailure.syncRunId.slice(0, 8)}): ${latestFailure.failure!.label}.`;
    }
    edgeExplanation += " Edge logs remain in Lovable Cloud.";
  }
  components.push({
    id: "edge",
    title: "Generation pipeline / Edge runtime",
    status: edgeStatus,
    explanation: edgeExplanation,
    lastObservedAt: jobs?.[0]?.updatedAt ?? null,
    source: {
      label: "get_ops_scanner_diagnostics_v1",
      detail: "admin-only redacted projection of screener_sync_generation_jobs",
    },
    userImpact: false,
  });

  // Source sync -------------------------------------------------------------
  const sourceSync =
    inputs.sourceSync.state === "ok"
      ? { ...classifySourceSync(inputs.sourceSync.data), observation: inputs.sourceSync.data }
      : null;
  components.push({
    id: "source_sync",
    title: "GitHub → Lovable source sync",
    status: sourceSync?.status ?? statusForMissing(inputs.sourceSync),
    explanation: sourceSync?.explanation ?? unavailableText(inputs.sourceSync),
    lastObservedAt: inputs.sourceSync.fetchedAt,
    source: {
      label: "GitHub REST (public)",
      detail: `main vs ${LOVABLE_INTEGRATION_BRANCH}`,
      href: `https://github.com/${GITHUB_REPO}/compare/main...${LOVABLE_INTEGRATION_BRANCH}`,
    },
    userImpact: false,
  });

  // Deployment provenance ---------------------------------------------------
  const mainSha = sourceSync?.observation.main.sha ?? null;
  const edgeAttest = inputs.attestations.filter((a) => a.componentId === "sync_screener_data_edge");
  const flyAttest = inputs.attestations.filter((a) => /fly|radar_worker/i.test(a.componentId));
  const runtime: RuntimeIdentityView[] = [
    classifyFrontendBuild(inputs.frontendBuildSha, mainSha),
    { ...classifyAttestedRuntime("Edge sync-screener-data", edgeAttest) },
    { ...classifyAttestedRuntime("Fly stocksist-radar-v22-worker", flyAttest) },
  ];
  const unverified = runtime.filter((r) => r.status !== "healthy").length;
  components.push({
    id: "provenance",
    title: "Deployment provenance",
    status: worstStatus(runtime.map((r) => (r.status === "not_configured" ? "unknown" : r.status))),
    explanation:
      unverified === 0
        ? "All runtime identities attested."
        : `${unverified} of ${runtime.length} runtime identities unverified. Git merge or source hash does not prove a deployed binary.`,
    lastObservedAt: null,
    source: { label: "Batch 210 attestations + bundle build env", detail: "docs/release/manifests/attestations/" },
    userImpact: false,
  });

  return {
    context,
    diagnostics,
    overall: computeOverallHealth(components),
    components,
    publication,
    jobs,
    worker,
    sourceSync,
    runtime,
    inputs,
  };
}
