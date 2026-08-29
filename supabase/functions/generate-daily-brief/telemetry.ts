export type BriefOutcome =
  | "generated"
  | "source_stale"
  | "provider_error"
  | "parse_error"
  | "db_error";

export interface BriefTelemetry {
  brief_type: string;
  outcome: BriefOutcome;
  reason: string | null;
  index_age_ms: number | null;
  anthropic_http_status: number | null;
  anthropic_error_type: string | null;
  elapsed_ms: number;
}

export function maxIndexAgeMs(
  rows: Array<{ updated_at?: unknown }>,
  nowMs: number,
): number | null {
  let max: number | null = null;
  for (const r of rows) {
    if (typeof r.updated_at !== "string") continue;
    const t = Date.parse(r.updated_at);
    if (!Number.isFinite(t)) continue;
    const age = nowMs - t;
    if (!Number.isFinite(age)) continue;
    if (max === null || age > max) max = age;
  }
  return max;
}

export function formatBriefTelemetry(fields: BriefTelemetry): string {
  return JSON.stringify({
    event: "generate_daily_brief",
    brief_type: fields.brief_type,
    outcome: fields.outcome,
    reason: fields.reason,
    index_age_ms: fields.index_age_ms,
    anthropic_http_status: fields.anthropic_http_status,
    anthropic_error_type: fields.anthropic_error_type,
    elapsed_ms: fields.elapsed_ms,
  });
}

export function emitBriefTelemetry(startedAtMs: number, fields: Omit<BriefTelemetry, "elapsed_ms">): void {
  console.log(formatBriefTelemetry({
    ...fields,
    elapsed_ms: Date.now() - startedAtMs,
  }));
}

export function outcomeFromIndexReason(reason: string): BriefOutcome {
  return reason === "source_stale" ? "source_stale" : "db_error";
}
