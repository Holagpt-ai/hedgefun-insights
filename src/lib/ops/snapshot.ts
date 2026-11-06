/**
 * Combines adapter results into the six Platform Overview summaries.
 * Pure — tested without network.
 */

import type { SessionContext } from "@/lib/ops/freshness";
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
  type GenerationJobOpsRecord,
  type GenerationJobOpsView,
  type PublicationOpsView,
} from "@/lib/ops/scanner";
import type { SourceResult } from "@/lib/ops/sources";
import { computeOverallHealth, worstStatus, type OpsComponentSummary, type OpsStatus, type OverallHealth } from "@/lib/ops/status";
import { buildWorkerOpsView, type RadarFeedOpsRow, type WorkerOpsView } from "@/lib/ops/worker";

export interface OpsSnapshotInputs {
  context: SessionContext;
  feedState: SourceResult<FeedStateOpsRow>;
  radarFeed: SourceResult<RadarFeedOpsRow>;
  jobs: SourceResult<GenerationJobOpsRecord[]>;
  edgeLogs: SourceResult<never>;
  sourceSync: SourceResult<SourceSyncObservation>;
  attestations: AttestationRecord[];
  frontendBuildSha: string | null;
}

export interface OpsSnapshot {
  context: SessionContext;
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
  const { context } = inputs;
  const components: OpsComponentSummary[] = [];

  // A. Scanner publication health -------------------------------------------
  const publication = inputs.feedState.state === "ok" ? buildPublicationOpsView(inputs.feedState.data, context) : null;
  components.push({
    id: "scanner",
    title: "Scanner publication",
    status: publication?.status ?? statusForMissing(inputs.feedState),
    explanation: publication?.explanation ?? unavailableText(inputs.feedState),
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
  const jobs =
    inputs.jobs.state === "ok" ? inputs.jobs.data.map((j) => classifyGenerationJob(j, context.nowMs)) : null;
  const latestFailure = jobs?.find((j) => j.failure !== null) ?? null;
  components.push({
    id: "edge",
    title: "Edge runtime failures",
    status: jobs ? worstStatus(jobs.slice(0, 3).map((j) => j.status)) : "unknown",
    explanation: jobs
      ? latestFailure
        ? `Latest recorded failure: ${latestFailure.failure!.label}.`
        : "No runtime failure recorded on recent generation jobs."
      : `${unavailableText(inputs.jobs)} ${unavailableText(inputs.edgeLogs)}`.trim(),
    lastObservedAt: jobs?.[0]?.updatedAt ?? null,
    source: { label: "screener_sync_generation_jobs / Lovable Cloud Edge logs" },
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
