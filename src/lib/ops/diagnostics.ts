/**
 * Batch 213 — parser for `get_ops_scanner_diagnostics_v1` (schema_version 1)
 * and holiday-aware session resolution from its exception calendar.
 *
 * The parser is strict: unknown shapes are dropped, strings are redacted and
 * bounded again on the client, and no field outside the whitelist survives.
 */

import {
  isIsoDate,
  resolveSessionSchedule,
  type CalendarExceptionRow,
  type SessionKind,
} from "@/lib/equities-session-calendar";
import { easternParts, resolveMarketSessionAt } from "@/lib/market-session";
import type { SessionContext } from "@/lib/ops/freshness";
import { safeDisplayText } from "@/lib/ops/redact";
import type { GenerationJobOpsRecord } from "@/lib/ops/scanner";

export interface AbortTabEvidence {
  tab: string;
  priorStatus: string | null;
  candidateStatus: string | null;
  triggeredPreservation: boolean;
}

export interface OpsCalendar {
  todayEt: string | null;
  loaded: boolean;
  latestUpdatedAt: string | null;
  maxSessionDate: string | null;
  exceptions: CalendarExceptionRow[];
}

export interface OpsDiagnostics {
  observedAt: string;
  jobLimit: number;
  jobs: GenerationJobOpsRecord[];
  strandedFinalizingCount: number;
  calendar: OpsCalendar;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOB_STATUSES = new Set(["chunking", "finalizing", "published", "failed", "aborted"]);
const ABORT_REASONS = new Set(["prior_generation_retained", "newer_generation_live"]);

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function ts(v: unknown): string | null {
  return typeof v === "string" && Number.isFinite(Date.parse(v)) ? v : null;
}
function int(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
}
function shortText(v: unknown, max: number): string | null {
  return typeof v === "string" ? safeDisplayText(v, max) : null;
}

function parseAbortTabs(v: unknown): AbortTabEvidence[] | null {
  if (!Array.isArray(v)) return null;
  const out: AbortTabEvidence[] = [];
  for (const raw of v.slice(0, 6)) {
    const t = rec(raw);
    const tab = shortText(t?.tab, 40);
    if (!t || !tab) continue;
    out.push({
      tab,
      priorStatus: shortText(t.prior_status, 40),
      candidateStatus: shortText(t.candidate_status, 40),
      triggeredPreservation: t.triggered_preservation === true,
    });
  }
  return out;
}

export function parseDiagnosticsJob(raw: unknown): GenerationJobOpsRecord | null {
  const j = rec(raw);
  if (!j) return null;
  if (typeof j.id !== "string" || !UUID_RE.test(j.id)) return null;
  if (typeof j.sync_run_id !== "string" || !UUID_RE.test(j.sync_run_id)) return null;
  if (typeof j.status !== "string" || !JOB_STATUSES.has(j.status)) return null;
  const next = int(j.next_chunk_index);
  const total = int(j.total_chunks);
  const created = ts(j.created_at);
  const updated = ts(j.updated_at);
  if (next === null || total === null || !created || !updated) return null;
  const abortReason = typeof j.abort_reason === "string" && ABORT_REASONS.has(j.abort_reason) ? j.abort_reason : null;
  return {
    id: j.id,
    sync_run_id: j.sync_run_id,
    status: j.status,
    next_chunk_index: next,
    total_chunks: total,
    lease_expires_at: ts(j.lease_expires_at),
    finalize_lease_expires_at: ts(j.finalize_lease_expires_at),
    continue_last_at: ts(j.continue_last_at),
    continue_last_error: shortText(j.continue_last_error, 300),
    abort_reason: abortReason,
    abort_prior_synced_at: ts(j.abort_prior_synced_at),
    abort_tabs: parseAbortTabs(j.abort_tabs),
    publish_rows_inserted: int(j.publish_rows_inserted),
    publish_rpc_recorded_at: ts(j.publish_rpc_recorded_at),
    created_at: created,
    updated_at: updated,
  };
}

function parseCalendarRow(raw: unknown): CalendarExceptionRow | null {
  const c = rec(raw);
  if (!c || !isIsoDate(c.session_date)) return null;
  if (c.market_status !== "closed" && c.market_status !== "early_close") return null;
  const time = (v: unknown) => (typeof v === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(v) ? v : null);
  const open = time(c.regular_open_et);
  const close = time(c.regular_close_et);
  const ah = time(c.after_hours_end_et);
  if (!open || !close || !ah) return null;
  return {
    session_date: c.session_date,
    market_status: c.market_status,
    regular_open_et: open,
    regular_close_et: close,
    after_hours_end_et: ah,
    holiday_name: shortText(c.holiday_name, 80),
  };
}

export function parseOpsDiagnostics(raw: unknown): OpsDiagnostics | null {
  const d = rec(raw);
  if (!d || d.schema_version !== 1) return null;
  const observedAt = ts(d.observed_at);
  if (!observedAt || !Array.isArray(d.jobs)) return null;
  const jobs = d.jobs.slice(0, 20).map(parseDiagnosticsJob).filter((j): j is GenerationJobOpsRecord => j !== null);
  const cal = rec(d.calendar);
  const exceptions = Array.isArray(cal?.exceptions)
    ? cal!.exceptions.slice(0, 40).map(parseCalendarRow).filter((r): r is CalendarExceptionRow => r !== null)
    : [];
  return {
    observedAt,
    jobLimit: int(d.job_limit) ?? jobs.length,
    jobs,
    strandedFinalizingCount: int(d.stranded_finalizing_count) ?? 0,
    calendar: {
      todayEt: isIsoDate(cal?.today_et) ? (cal!.today_et as string) : null,
      loaded: cal?.loaded === true,
      latestUpdatedAt: ts(cal?.latest_updated_at),
      maxSessionDate: isIsoDate(cal?.max_session_date) ? (cal!.max_session_date as string) : null,
      exceptions,
    },
  };
}

function etDate(nowMs: number): string | null {
  const p = easternParts(nowMs);
  if (!p) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * Calendar coverage is trusted only when the table is loaded and its newest
 * stored exception is on or after today (ET). Otherwise behave as Batch 212:
 * weekday fallback with calendarVerified=false.
 */
export function isCalendarCoverageVerified(calendar: OpsCalendar | null, nowMs: number): boolean {
  const today = etDate(nowMs);
  if (!calendar || !calendar.loaded || !calendar.maxSessionDate || !today) return false;
  return calendar.maxSessionDate >= today;
}

export function resolveSessionContextWithCalendar(nowMs: number, calendar: OpsCalendar | null): SessionContext & {
  holidayName: string | null;
  marketStatus: "open" | "closed" | "early_close";
} {
  const today = etDate(nowMs);
  if (!today) return { nowMs, session: "closed", calendarVerified: false, holidayName: null, marketStatus: "closed" };
  const verified = isCalendarCoverageVerified(calendar, nowMs);
  const schedule = resolveSessionSchedule(today, verified ? calendar!.exceptions : null);
  return {
    nowMs,
    session: resolveMarketSessionAt(nowMs, schedule) as SessionKind,
    calendarVerified: verified,
    holidayName: schedule.holidayName,
    marketStatus: schedule.marketStatus,
  };
}
