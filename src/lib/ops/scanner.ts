/**
 * Scanner publication observation (Operations Control Center V1).
 *
 * Observes `screener_feed_state` (the atomically published generation) and,
 * when an approved admin read path exists, `screener_sync_generation_jobs`
 * rows. Never changes ranking, qualification, scheduling, leases or the
 * publication contract — pure classification only.
 */

import {
  MANAGED_TAB_IDS,
  SCREENER_STALE_AFTER_MS,
  parseNhlBaselineStatus,
  type ManagedTabId,
} from "@/lib/screeners/contract";
import {
  parseTabEvaluationEvidencePartial,
  type TabEvaluationEvidence,
} from "@/lib/screeners/tab-evaluation-evidence";
import {
  DELAYED_FEED_ALLOWANCE_MS,
  assessFreshness,
  type FreshnessAssessment,
  type SessionContext,
} from "@/lib/ops/freshness";
import { safeDisplayText } from "@/lib/ops/redact";
import type { OpsStatus } from "@/lib/ops/status";

export const TAB_LABEL: Record<ManagedTabId, string> = {
  day_trade_radar: "Day Trade Radar",
  gappers: "Gappers",
  volume_spikes: "Volume Spikes",
  gainers_losers: "Gainers / Losers",
  unusual_volume: "Unusual Volume",
  new_highs_lows: "New Highs / Lows",
};

/** Columns read from `screener_feed_state` (already SELECT-granted to authenticated). */
export const FEED_STATE_OPS_SELECT =
  "state_key,sync_run_id,status,synced_at,provider_as_of_min,provider_as_of_max,rows_inserted,tab_counts,nhl_baseline_status,tab_evaluation_evidence,updated_at";

export interface FeedStateOpsRow {
  state_key: string;
  sync_run_id: string;
  status: string;
  synced_at: string;
  provider_as_of_min: string | null;
  provider_as_of_max: string | null;
  rows_inserted: number;
  tab_counts: unknown;
  nhl_baseline_status: string | null;
  tab_evaluation_evidence: unknown;
  updated_at: string;
}

export type TabOpsState =
  | "current"
  | "publication_only"
  | "prerequisite_unavailable"
  | "not_evaluated"
  | "unverified"
  | "stale";

export interface TabOpsRow {
  tab: ManagedTabId;
  label: string;
  state: TabOpsState;
  status: OpsStatus;
  publishedCount: number | null;
  explanation: string;
}

export interface PublicationOpsView {
  syncRunId: string;
  feedStatus: string;
  /** DB time the generation was atomically published (`synced_at`). */
  publishedAt: string;
  /** Newest provider observation inside the published generation. */
  providerObservedAt: string | null;
  providerObservedMinAt: string | null;
  updatedAt: string;
  rowsInserted: number;
  publication: FreshnessAssessment;
  providerData: FreshnessAssessment;
  tabs: TabOpsRow[];
  /** Publication status of the scanner component overall. */
  status: OpsStatus;
  explanation: string;
}

function tabCount(tabCounts: unknown, tab: ManagedTabId): number | null {
  if (!tabCounts || typeof tabCounts !== "object" || Array.isArray(tabCounts)) return null;
  const v = (tabCounts as Record<string, unknown>)[tab];
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}

function evidenceReason(ev: TabEvaluationEvidence): string | null {
  return "reason" in ev && typeof ev.reason === "string" ? safeDisplayText(ev.reason, 120) : null;
}

export function classifyTab(
  tab: ManagedTabId,
  evidence: TabEvaluationEvidence | undefined,
  publishedCount: number | null,
  generationFresh: OpsStatus,
  nhlBaselineStatus: string | null,
): TabOpsRow {
  const label = TAB_LABEL[tab];
  const base = { tab, label, publishedCount };

  if (generationFresh === "degraded" || generationFresh === "failing") {
    return {
      ...base,
      state: "stale",
      status: generationFresh,
      explanation: "Published generation is older than its refresh window.",
    };
  }

  if (!evidence) {
    return {
      ...base,
      state: "unverified",
      status: "unknown",
      explanation: "No tab evaluation evidence persisted for this generation.",
    };
  }

  if (evidence.status === "publication_confirmed") {
    return {
      ...base,
      state: "publication_only",
      status: "unknown",
      explanation: "Only published row counts are confirmed; universe evaluation not evidenced.",
    };
  }

  if (evidence.status === "prerequisite_unavailable") {
    const reason = evidenceReason(evidence);
    let detail = reason ? `Prerequisite unavailable (${reason}).` : "Prerequisite unavailable.";
    if (tab === "gappers" && "unresolved_gap_input_count" in evidence) {
      const unresolved = evidence.unresolved_gap_input_count;
      const split = evidence.split_scale_suppressed_count;
      if (typeof unresolved === "number") detail += ` Unresolved gap inputs: ${unresolved}.`;
      if (typeof split === "number") detail += ` Split-scale suppressed: ${split}.`;
    }
    return { ...base, state: "prerequisite_unavailable", status: "degraded", explanation: detail };
  }

  if (evidence.status === "not_evaluated") {
    const baseline = parseNhlBaselineStatus(nhlBaselineStatus);
    return {
      ...base,
      state: "not_evaluated",
      status: "degraded",
      explanation: `Not evaluated${baseline ? ` (52-week baseline: ${baseline})` : ""}.`,
    };
  }

  if (generationFresh === "not_applicable") {
    return {
      ...base,
      state: "current",
      status: "not_applicable",
      explanation: "Evaluated in the last published generation; session inactive.",
    };
  }

  if (generationFresh === "unknown") {
    return {
      ...base,
      state: "unverified",
      status: "unknown",
      explanation: "Evaluated, but publication age could not be determined.",
    };
  }

  return {
    ...base,
    state: "current",
    status: "healthy",
    explanation: "Evaluated in the current published generation.",
  };
}

export function buildPublicationOpsView(
  row: FeedStateOpsRow,
  context: SessionContext,
): PublicationOpsView {
  const publication = assessFreshness({
    context,
    observedAtIso: row.synced_at,
    staleAfterMs: SCREENER_STALE_AFTER_MS,
  });
  const providerData = assessFreshness({
    context,
    observedAtIso: row.provider_as_of_max,
    staleAfterMs: SCREENER_STALE_AFTER_MS,
    providerDelayMs: DELAYED_FEED_ALLOWANCE_MS,
  });

  const evidence = parseTabEvaluationEvidencePartial(row.tab_evaluation_evidence);
  const tabs = MANAGED_TAB_IDS.map((tab) =>
    classifyTab(
      tab,
      evidence?.[tab],
      tabCount(row.tab_counts, tab),
      publication.status,
      row.nhl_baseline_status,
    )
  );

  let status: OpsStatus = publication.status;
  let explanation = `Publication: ${publication.explanation}`;
  if (row.status !== "available" && row.status !== "empty") {
    status = "degraded";
    explanation = `Feed state status "${safeDisplayText(row.status, 40)}" is not a published state.`;
  } else if (status === "healthy" && tabs.some((t) => t.status === "degraded")) {
    status = "degraded";
    explanation = `Published on time, but ${tabs.filter((t) => t.status === "degraded").map((t) => t.label).join(", ")} lack evaluation prerequisites.`;
  } else if (status === "healthy" && tabs.some((t) => t.status === "unknown")) {
    explanation = `Published on time; ${tabs.filter((t) => t.status === "unknown").length} tab(s) lack evaluation evidence.`;
  }

  return {
    syncRunId: row.sync_run_id,
    feedStatus: row.status,
    publishedAt: row.synced_at,
    providerObservedAt: row.provider_as_of_max,
    providerObservedMinAt: row.provider_as_of_min,
    updatedAt: row.updated_at,
    rowsInserted: row.rows_inserted,
    publication,
    providerData,
    tabs,
    status,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Runtime failure classification
// ---------------------------------------------------------------------------

export type RuntimeFailureClass =
  | "cpu_exhaustion_confirmed"
  | "edge_resource_limit_546"
  | "wall_clock_timeout"
  | "http_error"
  | "lease_or_cas_rejected"
  | "network_error"
  | "other";

export interface RuntimeFailureClassification {
  kind: RuntimeFailureClass;
  label: string;
  httpStatus: number | null;
  message: string;
}

const CPU_MARKERS = /\b(cpu time (soft |hard )?limit|cpu[_ ]limit|exceeded cpu|cpu time exceeded)\b/i;

/**
 * Classify a recorded runtime failure string.
 *
 * - Explicit CPU-limit wording → confirmed CPU exhaustion.
 * - HTTP 546 / WORKER_LIMIT without CPU wording → Edge resource limit (CPU or
 *   memory). Project history attributes Nov 4 546s to CPU, but the string
 *   alone does not prove which resource.
 * - Generic 5xx, wall-clock timeouts and aborts are never CPU exhaustion.
 */
export function classifyRuntimeFailure(raw: unknown): RuntimeFailureClassification | null {
  const message = safeDisplayText(raw, 300);
  if (!message) return null;
  const statusMatch = message.match(/\b(?:http[_ ]?|status[ =:]*)?([45]\d\d)\b/i);
  const httpStatus = statusMatch ? Number(statusMatch[1]) : null;

  if (CPU_MARKERS.test(message)) {
    return { kind: "cpu_exhaustion_confirmed", label: "CPU exhaustion (explicit)", httpStatus, message };
  }
  if (httpStatus === 546 || /\bWORKER_LIMIT\b/.test(message)) {
    return {
      kind: "edge_resource_limit_546",
      label: "Edge resource limit (HTTP 546)",
      httpStatus: 546,
      message,
    };
  }
  if (/\b(timeout|timed out|aborterror|deadline)\b/i.test(message)) {
    return { kind: "wall_clock_timeout", label: "Wall-clock timeout (not CPU evidence)", httpStatus, message };
  }
  if (/\b(lease|cas|rejected|state_version)\b/i.test(message)) {
    return { kind: "lease_or_cas_rejected", label: "Lease / CAS rejection", httpStatus, message };
  }
  if (httpStatus !== null) {
    return { kind: "http_error", label: `HTTP ${httpStatus}`, httpStatus, message };
  }
  if (/\b(fetch failed|network|econnreset|connection)\b/i.test(message)) {
    return { kind: "network_error", label: "Network error", httpStatus, message };
  }
  return { kind: "other", label: "Runtime error", httpStatus, message };
}

// ---------------------------------------------------------------------------
// Generation job classification (requires admin read path — see adapters)
// ---------------------------------------------------------------------------

export interface GenerationJobOpsRecord {
  id: string;
  sync_run_id: string;
  status: "chunking" | "finalizing" | "published" | "failed" | "aborted" | string;
  next_chunk_index: number;
  total_chunks: number;
  lease_expires_at: string | null;
  finalize_lease_expires_at: string | null;
  continue_last_at: string | null;
  continue_last_error: string | null;
  abort_reason: string | null;
  publish_rows_inserted: number | null;
  publish_rpc_recorded_at: string | null;
  created_at: string;
  updated_at: string;
}

export type GenerationOutcome =
  | "published_persisted"
  | "published_unconfirmed"
  | "prior_generation_retained"
  | "newer_generation_live"
  | "finalize_failed_after_all_chunks"
  | "stranded_finalizing"
  | "finalizing"
  | "chunking"
  | "chunking_stalled"
  | "failed_during_chunking"
  | "aborted";

export interface GenerationJobOpsView {
  id: string;
  syncRunId: string;
  outcome: GenerationOutcome;
  status: OpsStatus;
  chunksCompleted: number;
  totalChunks: number;
  allChunksComplete: boolean;
  leaseExpired: boolean;
  finalizeLeaseExpired: boolean;
  persisted: boolean;
  failure: RuntimeFailureClassification | null;
  explanation: string;
  createdAt: string;
  updatedAt: string;
}

function expired(iso: string | null, nowMs: number): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms < nowMs;
}

export function classifyGenerationJob(job: GenerationJobOpsRecord, nowMs: number): GenerationJobOpsView {
  const chunksCompleted = Math.max(0, Math.min(job.next_chunk_index, job.total_chunks));
  const allChunksComplete = job.total_chunks > 0 && chunksCompleted >= job.total_chunks;
  const leaseExpired = expired(job.lease_expires_at, nowMs);
  const finalizeLeaseExpired = expired(job.finalize_lease_expires_at, nowMs);
  const persisted = job.publish_rpc_recorded_at !== null && (job.publish_rows_inserted ?? 0) > 0;
  const failure = classifyRuntimeFailure(job.continue_last_error);
  const chunkText = `${chunksCompleted}/${job.total_chunks} chunks`;

  const base = {
    id: job.id,
    syncRunId: job.sync_run_id,
    chunksCompleted,
    totalChunks: job.total_chunks,
    allChunksComplete,
    leaseExpired,
    finalizeLeaseExpired,
    persisted,
    failure,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };

  const make = (outcome: GenerationOutcome, status: OpsStatus, explanation: string): GenerationJobOpsView => ({
    ...base,
    outcome,
    status,
    explanation,
  });

  switch (job.status) {
    case "published":
      return persisted
        ? make("published_persisted", "healthy", `Published; publish RPC recorded ${job.publish_rows_inserted} rows.`)
        : make(
          "published_unconfirmed",
          "unknown",
          "Status is published but no publish RPC row count was recorded — persistence unconfirmed.",
        );
    case "aborted":
      if (job.abort_reason === "prior_generation_retained") {
        return make(
          "prior_generation_retained",
          "degraded",
          `${chunkText} completed; candidate not published — prior generation retained by the degradation guard.`,
        );
      }
      if (job.abort_reason === "newer_generation_live") {
        return make("newer_generation_live", "not_applicable", "Superseded by a newer live generation.");
      }
      return make("aborted", "degraded", `Aborted${job.abort_reason ? ` (${safeDisplayText(job.abort_reason, 60)})` : ""}.`);
    case "failed":
      return allChunksComplete
        ? make(
          "finalize_failed_after_all_chunks",
          "failing",
          `All ${chunkText} completed but finalize failed${failure ? ` — ${failure.label}` : ""}.`,
        )
        : make("failed_during_chunking", "failing", `Failed after ${chunkText}${failure ? ` — ${failure.label}` : ""}.`);
    case "finalizing":
      return finalizeLeaseExpired || leaseExpired
        ? make(
          "stranded_finalizing",
          "failing",
          `Stranded in finalizing with an expired lease after ${chunkText}${failure ? ` — ${failure.label}` : ""}.`,
        )
        : make("finalizing", "healthy", `Finalizing after ${chunkText}; lease active.`);
    case "chunking":
      return leaseExpired
        ? make(
          "chunking_stalled",
          "degraded",
          `Chunking stalled at ${chunkText}; lease expired (cron may resume)${failure ? ` — ${failure.label}` : ""}.`,
        )
        : make("chunking", "healthy", `Chunking in progress: ${chunkText}.`);
    default:
      return make("aborted", "unknown", `Unrecognised job status "${safeDisplayText(job.status, 40)}".`);
  }
}
