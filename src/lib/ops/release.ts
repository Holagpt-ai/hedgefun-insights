/**
 * Source synchronization (Batch 211) and deployment provenance (Batch 210)
 * classification. Source parity is never treated as runtime identity.
 */

import type { OpsStatus } from "@/lib/ops/status";
import { safeDisplayText } from "@/lib/ops/redact";

export const GITHUB_REPO = "Holagpt-ai/hedgefun-insights";
export const LOVABLE_INTEGRATION_BRANCH = "cursor/lovable-sync-from-main-20261024";
export const FORWARD_SYNC_WORKFLOW = "lovable-source-forward-sync.yml";

export interface BranchTip {
  sha: string;
  committedAt: string | null;
}

export interface WorkflowRunSummary {
  id: number;
  status: string | null;
  conclusion: string | null;
  event: string | null;
  headSha: string | null;
  createdAt: string | null;
  htmlUrl: string | null;
}

export interface SourceSyncObservation {
  main: BranchTip;
  integration: BranchTip;
  /** Commits on main that are not on integration. */
  behindBy: number;
  /** Commits on integration not on main (Lovable overlays). */
  aheadBy: number;
  latestRun: WorkflowRunSummary | null;
}

export interface SourceSyncView {
  status: OpsStatus;
  explanation: string;
  integrationContainsMain: boolean;
}

export function classifySourceSync(obs: SourceSyncObservation): SourceSyncView {
  const integrationContainsMain = obs.behindBy === 0;
  const run = obs.latestRun;
  const runFailed = run?.conclusion === "failure" || run?.conclusion === "timed_out";

  if (!integrationContainsMain) {
    return {
      status: "degraded",
      integrationContainsMain,
      explanation: `Integration is missing ${obs.behindBy} commit(s) from main. Lovable editor SHA not verified.`,
    };
  }
  if (runFailed) {
    return {
      status: "degraded",
      integrationContainsMain,
      explanation: `Integration contains main, but the latest forward-sync run concluded "${safeDisplayText(run?.conclusion, 20)}".`,
    };
  }
  return {
    status: "healthy",
    integrationContainsMain,
    explanation:
      "Integration branch contains GitHub main (git ancestry). Lovable editor SHA and runtime deploys are separate and not verified here.",
  };
}

// ---------------------------------------------------------------------------
// Deployment provenance
// ---------------------------------------------------------------------------

export interface AttestationRecord {
  manifestId: string;
  componentId: string;
  recordedAt: string | null;
  observer: string | null;
  platform: string | null;
  functionName: string | null;
  edgeFunctionVersion: number | null;
  imageDigest: string | null;
  deployedAt: string | null;
  notes: string | null;
  file: string;
}

export function parseAttestation(file: string, raw: unknown): AttestationRecord | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind !== "deployment_attestation") return null;
  if (typeof obj.manifest_id !== "string" || typeof obj.component_id !== "string") return null;
  const observed =
    obj.observed && typeof obj.observed === "object" && !Array.isArray(obj.observed)
      ? (obj.observed as Record<string, unknown>)
      : {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : null);
  return {
    manifestId: obj.manifest_id,
    componentId: obj.component_id,
    recordedAt: str(obj.recorded_at),
    observer: str(obj.observer),
    platform: str(observed.platform),
    functionName: str(observed.function_name),
    edgeFunctionVersion: typeof observed.edge_function_version === "number" ? observed.edge_function_version : null,
    imageDigest: str(observed.image_digest),
    deployedAt: str(observed.deployed_at),
    notes: safeDisplayText(obj.evidence_notes, 300),
    file,
  };
}

export interface RuntimeIdentityView {
  component: string;
  status: OpsStatus;
  reported: string | null;
  explanation: string;
  observedAt: string | null;
  sourceLabel: string;
}

/**
 * Runtime identity is "healthy" (verified) only when a platform digest is
 * attested. Owner-reported versions are shown but stay UNKNOWN.
 */
export function classifyAttestedRuntime(
  component: string,
  attestations: AttestationRecord[],
): RuntimeIdentityView {
  const latest = [...attestations].sort((a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? ""))[0];
  if (!latest) {
    return {
      component,
      status: "unknown",
      reported: null,
      explanation: "No deployment attestation recorded in git (docs/release/manifests/attestations/).",
      observedAt: null,
      sourceLabel: "Batch 210 attestations",
    };
  }
  const reported = latest.edgeFunctionVersion !== null ? `v${latest.edgeFunctionVersion}` : latest.imageDigest;
  if (latest.imageDigest) {
    return {
      component,
      status: "healthy",
      reported,
      explanation: `Platform digest attested (${latest.observer ?? "unknown observer"}).`,
      observedAt: latest.recordedAt,
      sourceLabel: latest.file,
    };
  }
  return {
    component,
    status: "unknown",
    reported,
    explanation: `Reported ${reported ?? "version"} by ${latest.observer ?? "unknown observer"}; no platform digest — runtime identity UNKNOWN. This is a historical record, not a current observation.`,
    observedAt: latest.recordedAt,
    sourceLabel: latest.file,
  };
}

/**
 * Frontend bundle identity: Vercel exposes `VITE_VERCEL_GIT_COMMIT_SHA` to
 * Vite builds when system environment variables are exposed. It is what the
 * running bundle reports about its own build, not a platform attestation.
 */
export function classifyFrontendBuild(
  buildSha: string | null | undefined,
  mainSha: string | null,
): RuntimeIdentityView {
  const sha = typeof buildSha === "string" && /^[0-9a-f]{7,40}$/i.test(buildSha) ? buildSha : null;
  if (!sha) {
    return {
      component: "Vercel frontend",
      status: "not_configured",
      reported: null,
      explanation: "This bundle carries no build commit (VITE_VERCEL_GIT_COMMIT_SHA not exposed). Runtime identity UNKNOWN.",
      observedAt: null,
      sourceLabel: "Bundle build environment",
    };
  }
  if (!mainSha) {
    return {
      component: "Vercel frontend",
      status: "unknown",
      reported: sha.slice(0, 12),
      explanation: "Bundle reports its build commit; GitHub main could not be read to compare.",
      observedAt: null,
      sourceLabel: "Bundle build environment",
    };
  }
  const matches = mainSha.toLowerCase().startsWith(sha.toLowerCase()) || sha.toLowerCase().startsWith(mainSha.toLowerCase());
  return {
    component: "Vercel frontend",
    status: matches ? "healthy" : "degraded",
    reported: sha.slice(0, 12),
    explanation: matches
      ? "The bundle you are running reports it was built from current GitHub main (bundle-reported, not a platform attestation)."
      : "The bundle you are running was built from a commit other than current GitHub main — a newer deploy may be pending or the tab is stale.",
    observedAt: null,
    sourceLabel: "Bundle build environment",
  };
}
