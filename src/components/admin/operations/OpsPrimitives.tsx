import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import { OPS_STATUS_LABEL, type EvidenceSource, type OpsStatus } from "@/lib/ops/status";
import { formatAge } from "@/lib/ops/freshness";

/** Unknown / not-configured are neutral grey or amber — never green. */
const STATUS_STYLE: Record<OpsStatus, { fg: string; bg: string; dot: string }> = {
  healthy: { fg: "#15803d", bg: "rgba(22,163,74,0.10)", dot: "#16a34a" },
  degraded: { fg: "#b45309", bg: "rgba(217,119,6,0.12)", dot: "#d97706" },
  failing: { fg: "#b91c1c", bg: "rgba(220,38,38,0.10)", dot: "#dc2626" },
  unknown: { fg: "#475569", bg: "rgba(100,116,139,0.12)", dot: "#94a3b8" },
  stale_telemetry: { fg: "#7c2d12", bg: "rgba(234,88,12,0.10)", dot: "#ea580c" },
  not_configured: { fg: "#475569", bg: "rgba(100,116,139,0.08)", dot: "#cbd5e1" },
  not_applicable: { fg: "#64748b", bg: "rgba(148,163,184,0.10)", dot: "#cbd5e1" },
};

export function StatusPill({ status, size = "sm" }: { status: OpsStatus; size?: "sm" | "lg" }) {
  const s = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded font-semibold whitespace-nowrap ${size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs"}`}
      style={{ color: s.fg, background: s.bg }}
      data-ops-status={status}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.dot }} />
      {OPS_STATUS_LABEL[status]}
    </span>
  );
}

export function Panel({ title, subtitle, children, right }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-lg border bg-white" style={{ borderColor: "#e2e8f0" }}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "#e2e8f0" }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#0f172a" }}>{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs" style={{ color: "#64748b" }}>{subtitle}</p>}
        </div>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function SourceRef({ source }: { source: EvidenceSource }) {
  const body = (
    <>
      <span className="font-mono">{source.label}</span>
      {source.detail && <span> — {source.detail}</span>}
    </>
  );
  return (
    <p className="text-[11px] leading-snug" style={{ color: "#94a3b8" }}>
      Source:{" "}
      {source.href ? (
        <a href={source.href} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 underline hover:text-slate-600">
          {body}
          <ExternalLink size={10} />
        </a>
      ) : (
        body
      )}
    </p>
  );
}

const ET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function Timestamp({ iso, nowMs, empty = "—" }: { iso: string | null | undefined; nowMs: number; empty?: string }) {
  if (!iso) return <span style={{ color: "#94a3b8" }}>{empty}</span>;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return <span style={{ color: "#94a3b8" }}>invalid</span>;
  return (
    <span title={iso} className="tabular-nums">
      {ET_FORMAT.format(ms)} ET <span style={{ color: "#94a3b8" }}>({formatAge(nowMs - ms)} ago)</span>
    </span>
  );
}

export function KeyValue({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-[minmax(0,200px)_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt style={{ color: "#64748b" }}>{k}</dt>
          <dd className="min-w-0 break-words" style={{ color: "#0f172a" }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return (
    <div
      className="rounded-md border px-3 py-2 text-xs leading-relaxed"
      style={
        tone === "warn"
          ? { borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" }
          : { borderColor: "#e2e8f0", background: "#f8fafc", color: "#475569" }
      }
    >
      {children}
    </div>
  );
}

export function Sha({ sha }: { sha: string | null | undefined }) {
  if (!sha) return <span style={{ color: "#94a3b8" }}>unknown</span>;
  return (
    <a
      href={`https://github.com/Holagpt-ai/hedgefun-insights/commit/${sha}`}
      target="_blank"
      rel="noreferrer noopener"
      className="font-mono underline"
      title={sha}
    >
      {sha.slice(0, 10)}
    </a>
  );
}
