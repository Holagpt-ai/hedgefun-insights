/**
 * Operations Control Center V1 — read-only visibility (Batch 212).
 *
 * Mounted under AdminLayout → AdminGuard (server-side `has_role` RPC). The
 * page performs SELECTs that the authenticated role already has, public
 * GitHub reads, and bundled git attestations. It never writes, deploys,
 * replays, restarts or activates anything.
 */

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  KeyValue,
  Notice,
  Panel,
  Sha,
  SourceRef,
  StatusPill,
  Timestamp,
} from "@/components/admin/operations/OpsPrimitives";
import { useOperationsSnapshot } from "@/hooks/useOperationsSnapshot";
import { SESSION_LABEL, formatAge } from "@/lib/ops/freshness";
import { FORWARD_SYNC_WORKFLOW, GITHUB_REPO, LOVABLE_INTEGRATION_BRANCH } from "@/lib/ops/release";
import type { OpsSnapshot } from "@/lib/ops/snapshot";
import type { SourceResult } from "@/lib/ops/sources";
import { safeDisplayText } from "@/lib/ops/redact";

function unavailableLine(r: SourceResult<unknown>): string | null {
  if (r.state === "unavailable") return `${r.reason.replace(/_/g, " ")} — ${r.detail}`;
  if (r.state === "empty") return r.detail;
  return null;
}

function OverallSummary({ s }: { s: OpsSnapshot }) {
  const { overall, context } = s;
  return (
    <div className="rounded-lg border bg-white p-4" style={{ borderColor: "#e2e8f0" }}>
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill status={overall.status} size="lg" />
        <p className="text-sm font-semibold" style={{ color: "#0f172a" }}>{overall.headline}</p>
      </div>
      <p className="mt-2 text-xs" style={{ color: "#64748b" }}>
        Session: <strong>{SESSION_LABEL[context.session]}</strong>
        {context.holidayName ? <> — <strong>{context.holidayName}</strong> ({context.marketStatus.replace("_", " ")})</> : null} (ET clock;{" "}
        {context.calendarVerified
          ? "exception calendar verified via admin diagnostics"
          : "holiday calendar unverified — weekday schedule assumed"}). Dashboard observed{" "}
        <Timestamp iso={new Date(context.nowMs).toISOString()} nowMs={context.nowMs} />. Overall health is driven by
        scanner, provider and worker evidence first; provenance and source sync are reported separately.
      </p>
    </div>
  );
}

function OverviewGrid({ s }: { s: OpsSnapshot }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {s.components.map((c) => (
        <div key={c.id} className="flex flex-col gap-2 rounded-lg border bg-white p-3" style={{ borderColor: "#e2e8f0" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold" style={{ color: "#0f172a" }}>{c.title}</span>
            <StatusPill status={c.status} />
          </div>
          <p className="text-xs leading-snug" style={{ color: "#334155" }}>{c.explanation}</p>
          <p className="text-[11px]" style={{ color: "#64748b" }}>
            Last observed: <Timestamp iso={c.lastObservedAt} nowMs={s.context.nowMs} empty="no observation" />
          </p>
          <SourceRef source={c.source} />
        </div>
      ))}
    </div>
  );
}

function ScannerPanel({ s }: { s: OpsSnapshot }) {
  const p = s.publication;
  const now = s.context.nowMs;
  const feedProblem = unavailableLine(s.inputs.feedState);
  const jobsProblem = unavailableLine(s.inputs.diagnostics);
  const diag = s.diagnostics;
  return (
    <Panel
      title="Scanner and data pipeline"
      subtitle="Published generation (atomic) and per-tab evaluation evidence. Observes only — no repair actions."
      right={p ? <StatusPill status={p.status} /> : <StatusPill status="unknown" />}
    >
      {!p ? (
        <Notice tone="warn">Published feed state unavailable: {feedProblem}</Notice>
      ) : (
        <div className="space-y-4">
          <KeyValue
            rows={[
              ["Published generation", <span className="font-mono">{p.syncRunId}</span>],
              ["Feed state status", p.feedStatus],
              ["Publication time (synced_at)", <Timestamp iso={p.publishedAt} nowMs={now} />],
              ["Provider observation (newest)", <Timestamp iso={p.providerObservedAt} nowMs={now} />],
              ["Provider observation (oldest)", <Timestamp iso={p.providerObservedMinAt} nowMs={now} />],
              ["Row last updated", <Timestamp iso={p.updatedAt} nowMs={now} />],
              ["Rows published", p.rowsInserted.toLocaleString()],
              ["Publication freshness", <span><StatusPill status={p.publication.status} /> {p.publication.explanation}</span>],
              ["Provider data freshness", <span><StatusPill status={p.providerData.status} /> {p.providerData.explanation}</span>],
            ]}
          />
          <p className="text-[11px]" style={{ color: "#64748b" }}>
            A row here means the generation was persisted and published by <span className="font-mono">publish_screener_sync_staged_generation_v1</span>.
            Fetch time is not stored separately; provider observation and publication times are shown as recorded.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-left" style={{ color: "#64748b" }}>
                  <th className="py-1.5 pr-3 font-medium">Tab</th>
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 pr-3 font-medium">Rows</th>
                  <th className="py-1.5 font-medium">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {p.tabs.map((t) => (
                  <tr key={t.tab} className="border-t align-top" style={{ borderColor: "#f1f5f9" }}>
                    <td className="py-1.5 pr-3 font-medium" style={{ color: "#0f172a" }}>{t.label}</td>
                    <td className="py-1.5 pr-3"><StatusPill status={t.status} /></td>
                    <td className="py-1.5 pr-3 tabular-nums">{t.publishedCount ?? "—"}</td>
                    <td className="py-1.5" style={{ color: "#334155" }}>{t.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SourceRef source={{ label: "screener_feed_state.tab_counts, tab_evaluation_evidence, nhl_baseline_status" }} />
        </div>
      )}

      <div className="mt-5 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#64748b" }}>
          Generation jobs, chunks, finalize, leases
        </h3>
        {s.jobs && diag ? (
          <div className="space-y-2">
          <p className="text-[11px]" style={{ color: "#64748b" }}>
            Newest {s.jobs.length} of at most {diag.jobLimit} jobs, read <Timestamp iso={diag.observedAt} nowMs={now} />.
            Stranded in finalizing (all jobs): <strong>{diag.strandedFinalizingCount}</strong>.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="text-left" style={{ color: "#64748b" }}>
                  <th className="py-1.5 pr-3 font-medium">Generation</th>
                  <th className="py-1.5 pr-3 font-medium">Outcome</th>
                  <th className="py-1.5 pr-3 font-medium">Chunks</th>
                  <th className="py-1.5 pr-3 font-medium">Persisted</th>
                  <th className="py-1.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {s.jobs.map((j) => (
                  <tr key={j.id} className="border-t align-top" style={{ borderColor: "#f1f5f9" }}>
                    <td className="py-1.5 pr-3 font-mono">{j.syncRunId.slice(0, 8)}</td>
                    <td className="py-1.5 pr-3"><StatusPill status={j.status} /></td>
                    <td className="py-1.5 pr-3 tabular-nums">{j.chunksCompleted}/{j.totalChunks}</td>
                    <td className="py-1.5 pr-3">{j.persisted ? "Yes" : "No"}</td>
                    <td className="py-1.5">{j.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SourceRef source={{ label: "get_ops_scanner_diagnostics_v1", detail: "admin-only, redacted, bounded (Batch 213)" }} />
          </div>
        ) : (
          <Notice>
            <strong>Not observable from this session.</strong> {jobsProblem} Current/most recent generation state, chunk
            completion, finalize outcome, lease expiry, prior-generation retention and the last runtime failure are
            therefore <strong>Unknown</strong> here. A stale publication time above is the only browser-visible symptom of
            a stranded, failed or retained generation. The admin diagnostics RPC (Batch 213) supplies these once Lovable Cloud applies its migration.
          </Notice>
        )}
      </div>
    </Panel>
  );
}

function EdgePanel({ s }: { s: OpsSnapshot }) {
  const edge = s.components.find((c) => c.id === "edge")!;
  const failure = s.jobs?.find((j) => j.failure)?.failure ?? null;
  return (
    <Panel title="Edge runtime failures" subtitle="sync-screener-data invocation failures" right={<StatusPill status={edge.status} />}>
      {failure ? (
        <KeyValue
          rows={[
            ["Classification", failure.label],
            ["HTTP status", failure.httpStatus ?? "—"],
            ["Message (redacted)", <span className="font-mono">{failure.message}</span>],
          ]}
        />
      ) : (
        <Notice>{edge.explanation}</Notice>
      )}
      <p className="mt-3 text-[11px] leading-snug" style={{ color: "#64748b" }}>
        Classification rules: only explicit CPU-limit wording counts as confirmed CPU exhaustion. HTTP 546 / WORKER_LIMIT
        is shown as an Edge resource limit (CPU or memory). Generic HTTP 500 and wall-clock timeouts are never labelled
        CPU exhaustion.
      </p>
    </Panel>
  );
}

function WorkerPanel({ s }: { s: OpsSnapshot }) {
  const w = s.worker;
  const now = s.context.nowMs;
  return (
    <Panel
      title="Worker and provider freshness"
      subtitle="stocksist-radar-v22-worker checkpoint and Polygon feed telemetry"
      right={<StatusPill status={w?.status ?? "unknown"} />}
    >
      {!w ? (
        <Notice tone="warn">Radar feed state unavailable: {unavailableLine(s.inputs.radarFeed)}</Notice>
      ) : (
        <div className="space-y-3">
          <KeyValue
            rows={[
              ["Worker status", <span><StatusPill status={w.status} /> {w.explanation}</span>],
              ["Last checkpoint (updated_at)", <Timestamp iso={w.checkpointAt} nowMs={now} />],
              ["Feed connection state", w.connectionState ?? "not reported"],
              ["Feed mode / provider", `${w.feedMode ?? "not reported"} / ${w.provider ?? "not reported"}`],
              ["Last provider event", <Timestamp iso={w.lastProviderEventAt} nowMs={now} />],
              ["Last feed message", <Timestamp iso={w.lastMessageAt} nowMs={now} />],
              ["Reported latency", w.latencyMs === null ? "not reported" : formatAge(w.latencyMs)],
              ["Worker session kind", w.sessionKind ?? "not reported"],
              ["Stale flags", `feed_stale=${String(w.feedStale)}, feed_telemetry_stale=${String(w.telemetryStale)}`],
              ["Provider freshness", <span><StatusPill status={w.providerStatus} /> {w.providerExplanation}</span>],
              ["Worker version", <span style={{ color: "#94a3b8" }}>Unknown — not persisted to any readable table</span>],
              ["Recent worker errors", <span style={{ color: "#94a3b8" }}>Unknown — Fly logs not accessible here</span>],
            ]}
          />
          <SourceRef source={{ label: "radar_v22_feed_state", detail: "state_key = current" }} />
        </div>
      )}
    </Panel>
  );
}

function ReleasePanel({ s }: { s: OpsSnapshot }) {
  const sync = s.sourceSync;
  const now = s.context.nowMs;
  const run = sync?.observation.latestRun ?? null;
  return (
    <Panel
      title="Source synchronization and deployment"
      subtitle="Source sync (git) and runtime identity are separate questions."
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#64748b" }}>GitHub → Lovable (Batch 211)</h3>
            <StatusPill status={sync?.status ?? "unknown"} />
          </div>
          {!sync ? (
            <Notice tone="warn">GitHub unavailable: {unavailableLine(s.inputs.sourceSync)}</Notice>
          ) : (
            <KeyValue
              rows={[
                ["GitHub main", <span><Sha sha={sync.observation.main.sha} /> <Timestamp iso={sync.observation.main.committedAt} nowMs={now} /></span>],
                [
                  "Lovable integration",
                  <span><Sha sha={sync.observation.integration.sha} /> <Timestamp iso={sync.observation.integration.committedAt} nowMs={now} /></span>,
                ],
                ["Integration contains main", sync.integrationContainsMain ? "Yes" : `No — ${sync.observation.behindBy} commit(s) behind`],
                ["Integration-only commits", sync.observation.aheadBy],
                [
                  "Latest forward-sync run",
                  run ? (
                    <span>
                      {run.htmlUrl ? <a className="underline" href={run.htmlUrl} target="_blank" rel="noreferrer noopener">#{run.id}</a> : `#${run.id}`}{" "}
                      {safeDisplayText(run.event, 20)} · {safeDisplayText(run.status, 20)}
                      {run.conclusion ? ` · ${safeDisplayText(run.conclusion, 20)}` : ""} · <Timestamp iso={run.createdAt} nowMs={now} />
                    </span>
                  ) : (
                    "No run found"
                  ),
                ],
                ["Sync result (status.json artifact)", <span style={{ color: "#94a3b8" }}>Unknown — artifact download requires GitHub credentials</span>],
                ["Controller activation", <span style={{ color: "#94a3b8" }}>Unknown — repository variables require credentials</span>],
                ["Lovable editor SHA", <span style={{ color: "#94a3b8" }}>Unverified — not exposed by an API</span>],
              ]}
            />
          )}
          <SourceRef
            source={{
              label: "GitHub REST",
              detail: `branches, compare, actions/workflows/${FORWARD_SYNC_WORKFLOW}`,
              href: `https://github.com/${GITHUB_REPO}/actions/workflows/${FORWARD_SYNC_WORKFLOW}`,
            }}
          />
          <p className="text-[11px]" style={{ color: "#94a3b8" }}>
            Compare: <a className="underline" href={`https://github.com/${GITHUB_REPO}/compare/main...${LOVABLE_INTEGRATION_BRANCH}`} target="_blank" rel="noreferrer noopener">main…integration</a>
          </p>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#64748b" }}>Runtime identity (Batch 210)</h3>
          <div className="space-y-2">
            {s.runtime.map((r) => (
              <div key={r.component} className="rounded-md border p-2.5" style={{ borderColor: "#f1f5f9" }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{r.component}</span>
                  <StatusPill status={r.status} />
                </div>
                <p className="mt-1 text-xs" style={{ color: "#334155" }}>
                  {r.reported ? <span className="font-mono">{r.reported}</span> : null} {r.explanation}
                </p>
                {r.observedAt && (
                  <p className="text-[11px]" style={{ color: "#64748b" }}>
                    Recorded: <Timestamp iso={r.observedAt} nowMs={now} />
                  </p>
                )}
                <SourceRef source={{ label: r.sourceLabel }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default function AdminOperationsPage() {
  const { snapshot, loading, refetch, refreshing } = useOperationsSnapshot();

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Operations</h1>
          <p className="text-xs" style={{ color: "#64748b" }}>
            Read-only, evidence-backed platform status. Unknown means no trustworthy evidence — never assumed healthy.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refetch} disabled={refreshing} aria-label="Re-read evidence">
          <RefreshCw size={14} className={refreshing ? "mr-1.5 animate-spin" : "mr-1.5"} />
          Re-read evidence
        </Button>
      </div>

      {loading || !snapshot ? (
        <div className="rounded-lg border bg-white p-6 text-sm" style={{ borderColor: "#e2e8f0", color: "#64748b" }}>
          Reading evidence sources…
        </div>
      ) : (
        <>
          <OverallSummary s={snapshot} />
          <OverviewGrid s={snapshot} />
          <ScannerPanel s={snapshot} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <EdgePanel s={snapshot} />
            <WorkerPanel s={snapshot} />
          </div>
          <ReleasePanel s={snapshot} />
          <Panel title="Recent operational events" subtitle="Shown only where persisted history exists">
            <Notice>
              No browser-readable event history exists for publications, Edge failures or worker restarts. Only the current
              published generation and current worker checkpoint are stored in readable tables, so no timeline is drawn.
            </Notice>
          </Panel>
        </>
      )}
    </div>
  );
}
