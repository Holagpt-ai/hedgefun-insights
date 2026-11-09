/**
 * Typed, read-only source adapters for the Operations Control Center.
 *
 * Every adapter resolves to a `SourceResult` and never throws, so one
 * unavailable integration cannot take down the page. No adapter writes,
 * invokes Edge Functions, or uses privileged credentials.
 */

import { supabase } from "@/integrations/supabase/client";
import { safeDisplayText } from "@/lib/ops/redact";
import {
  FORWARD_SYNC_WORKFLOW,
  GITHUB_REPO,
  LOVABLE_INTEGRATION_BRANCH,
  parseAttestation,
  type AttestationRecord,
  type SourceSyncObservation,
  type WorkflowRunSummary,
} from "@/lib/ops/release";
import { FEED_STATE_OPS_SELECT, type FeedStateOpsRow } from "@/lib/ops/scanner";
import { parseOpsDiagnostics, type OpsDiagnostics } from "@/lib/ops/diagnostics";
import { RADAR_FEED_OPS_SELECT, type RadarFeedOpsRow } from "@/lib/ops/worker";

export type UnavailableReason =
  | "permission_denied"
  | "no_read_path"
  | "requires_credentials"
  | "not_configured"
  | "rate_limited"
  | "network_error"
  | "invalid_response";

export type SourceResult<T> =
  | { state: "ok"; data: T; fetchedAt: string }
  | { state: "empty"; fetchedAt: string; detail: string }
  | { state: "unavailable"; reason: UnavailableReason; detail: string; fetchedAt: string };

const now = () => new Date().toISOString();

function unavailable<T>(reason: UnavailableReason, detail: unknown): SourceResult<T> {
  return { state: "unavailable", reason, detail: safeDisplayText(detail, 240) ?? reason, fetchedAt: now() };
}

function classifySupabaseError(error: { code?: string; message?: string }): UnavailableReason {
  if (error.code === "42501" || /permission denied/i.test(error.message ?? "")) return "permission_denied";
  if (/fetch|network/i.test(error.message ?? "")) return "network_error";
  return "invalid_response";
}

// ---------------------------------------------------------------------------
// Supabase (anon/authenticated SELECT grants that already exist)
// ---------------------------------------------------------------------------

export async function readScreenerFeedState(): Promise<SourceResult<FeedStateOpsRow>> {
  try {
    const { data, error } = await supabase
      .from("screener_feed_state")
      .select(FEED_STATE_OPS_SELECT)
      .eq("state_key", "current")
      .maybeSingle();
    if (error) return unavailable(classifySupabaseError(error), error.message);
    if (!data) return { state: "empty", fetchedAt: now(), detail: "No current screener_feed_state row." };
    return { state: "ok", data: data as unknown as FeedStateOpsRow, fetchedAt: now() };
  } catch (err) {
    return unavailable("network_error", err instanceof Error ? err.message : err);
  }
}

export async function readRadarFeedState(): Promise<SourceResult<RadarFeedOpsRow>> {
  try {
    const { data, error } = await supabase
      .from("radar_v22_feed_state")
      .select(RADAR_FEED_OPS_SELECT)
      .eq("state_key", "current")
      .maybeSingle();
    if (error) return unavailable(classifySupabaseError(error), error.message);
    if (!data) return { state: "empty", fetchedAt: now(), detail: "No current radar_v22_feed_state row." };
    return { state: "ok", data: data as unknown as RadarFeedOpsRow, fetchedAt: now() };
  } catch (err) {
    return unavailable("network_error", err instanceof Error ? err.message : err);
  }
}

/** Only RPC this module may call: admin-gated, read-only (Batch 213). */
export const OPS_DIAGNOSTICS_RPC = "get_ops_scanner_diagnostics_v1";
export const OPS_DIAGNOSTICS_JOB_LIMIT = 10;

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

/**
 * `screener_sync_generation_jobs` and `market_session_calendar` stay
 * service-role only. Batch 213 adds `get_ops_scanner_diagnostics_v1`, which
 * checks `has_role(auth.uid(), 'admin')` inside the database and returns a
 * bounded, redacted projection. Until Lovable Cloud applies that migration
 * the RPC is missing and this source reports "not configured".
 */
export async function readScannerDiagnostics(
  client: RpcClient = supabase as unknown as RpcClient,
): Promise<SourceResult<OpsDiagnostics>> {
  try {
    const { data, error } = await client.rpc(OPS_DIAGNOSTICS_RPC, { p_job_limit: OPS_DIAGNOSTICS_JOB_LIMIT });
    if (error) {
      // PGRST202 (PostgREST: function not in schema cache) / 42883 (undefined function).
      if (error.code === "PGRST202" || error.code === "42883") {
        return unavailable(
          "not_configured",
          "get_ops_scanner_diagnostics_v1 is not applied yet (Batch 213 migration awaits Lovable Cloud approval).",
        );
      }
      return unavailable(classifySupabaseError(error), error.message);
    }
    const parsed = parseOpsDiagnostics(data);
    if (!parsed) return unavailable("invalid_response", "Diagnostics payload did not match schema_version 1.");
    return { state: "ok", data: parsed, fetchedAt: now() };
  } catch (err) {
    return unavailable("network_error", err instanceof Error ? err.message : err);
  }
}

/** Edge Function logs live in Lovable Cloud; no browser-accessible read path. */
export async function readEdgeRuntimeLogs(): Promise<SourceResult<never>> {
  return unavailable("no_read_path", "Edge Function logs are only accessible inside Lovable Cloud.");
}

// ---------------------------------------------------------------------------
// GitHub (public repository — unauthenticated, read-only REST)
// ---------------------------------------------------------------------------

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const GITHUB_API = "https://api.github.com";

async function githubJson(fetchImpl: FetchLike, path: string): Promise<
  { ok: true; body: unknown } | { ok: false; reason: UnavailableReason; detail: string }
> {
  let res: Response;
  try {
    res = await fetchImpl(`${GITHUB_API}${path}`, {
      headers: { Accept: "application/vnd.github+json" },
      credentials: "omit",
    });
  } catch (err) {
    return { ok: false, reason: "network_error", detail: err instanceof Error ? err.message : String(err) };
  }
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    if (remaining === "0" || res.status === 429) {
      return { ok: false, reason: "rate_limited", detail: "GitHub unauthenticated API rate limit reached." };
    }
    return { ok: false, reason: "permission_denied", detail: `GitHub returned ${res.status}.` };
  }
  if (res.status === 401 || res.status === 404) {
    return { ok: false, reason: "requires_credentials", detail: `GitHub returned ${res.status}.` };
  }
  if (!res.ok) return { ok: false, reason: "invalid_response", detail: `GitHub returned ${res.status}.` };
  try {
    return { ok: true, body: await res.json() };
  } catch {
    return { ok: false, reason: "invalid_response", detail: "GitHub response was not JSON." };
  }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function branchTip(body: unknown): { sha: string; committedAt: string | null } | null {
  const commit = asRecord(asRecord(body)?.commit);
  const sha = commit?.sha;
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) return null;
  const inner = asRecord(commit?.commit);
  const committer = asRecord(inner?.committer);
  return { sha, committedAt: typeof committer?.date === "string" ? committer.date : null };
}

function parseRun(raw: unknown): WorkflowRunSummary | null {
  const r = asRecord(raw);
  if (!r || typeof r.id !== "number") return null;
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  const url = s(r.html_url);
  return {
    id: r.id,
    status: s(r.status),
    conclusion: s(r.conclusion),
    event: s(r.event),
    headSha: s(r.head_sha),
    createdAt: s(r.created_at),
    htmlUrl: url && url.startsWith("https://github.com/") ? url : null,
  };
}

export async function readSourceSync(fetchImpl: FetchLike = fetch): Promise<SourceResult<SourceSyncObservation>> {
  const enc = encodeURIComponent;
  const [mainRes, integRes, cmpRes, runsRes] = await Promise.all([
    githubJson(fetchImpl, `/repos/${GITHUB_REPO}/branches/main`),
    githubJson(fetchImpl, `/repos/${GITHUB_REPO}/branches/${enc(LOVABLE_INTEGRATION_BRANCH)}`),
    githubJson(fetchImpl, `/repos/${GITHUB_REPO}/compare/main...${enc(LOVABLE_INTEGRATION_BRANCH)}?per_page=1`),
    githubJson(fetchImpl, `/repos/${GITHUB_REPO}/actions/workflows/${FORWARD_SYNC_WORKFLOW}/runs?per_page=1`),
  ]);

  for (const r of [mainRes, integRes, cmpRes]) {
    if (r.ok === false) {
      const failed = r as { reason: UnavailableReason; detail: string };
      return unavailable(failed.reason, failed.detail);
    }
  }
  const bodyOf = (r: unknown) => (r as { body: unknown }).body;
  const main = branchTip(bodyOf(mainRes));
  const integration = branchTip(bodyOf(integRes));
  const cmp = asRecord(bodyOf(cmpRes));
  if (!main || !integration || typeof cmp?.behind_by !== "number" || typeof cmp?.ahead_by !== "number") {
    return unavailable("invalid_response", "GitHub branch or compare payload missing expected fields.");
  }

  let latestRun: WorkflowRunSummary | null = null;
  if (runsRes.ok === true) {
    const runs = asRecord(bodyOf(runsRes))?.workflow_runs;
    latestRun = Array.isArray(runs) && runs.length > 0 ? parseRun(runs[0]) : null;
  }

  return {
    state: "ok",
    fetchedAt: now(),
    data: { main, integration, behindBy: cmp.behind_by, aheadBy: cmp.ahead_by, latestRun },
  };
}

// ---------------------------------------------------------------------------
// Batch 210 attestations (git, bundled at build time)
// ---------------------------------------------------------------------------

const ATTESTATION_MODULES = import.meta.glob("/docs/release/manifests/attestations/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export function loadAttestations(modules: Record<string, unknown> = ATTESTATION_MODULES): AttestationRecord[] {
  const out: AttestationRecord[] = [];
  for (const [path, raw] of Object.entries(modules)) {
    const parsed = parseAttestation(path.replace(/^\//, ""), raw);
    if (parsed) out.push(parsed);
  }
  return out;
}

export function frontendBuildSha(): string | null {
  const v = import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}
