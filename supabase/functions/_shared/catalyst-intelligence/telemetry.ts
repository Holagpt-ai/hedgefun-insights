export interface ScoreBuckets {
  "80_100": number;
  "60_79": number;
  "40_59": number;
  "0_39": number;
}

export interface ProcessorTelemetry {
  mode: "dry_run" | "write";
  rules_version: string;
  started_at: string;
  completed_at: string;
  events_scanned: number;
  events_processed: number;
  events_skipped: number;
  provider_counts: Record<string, number>;
  class_counts: Record<string, number>;
  score_buckets: ScoreBuckets;
  alerts_qualified: number;
  alerts_suppressed: number;
  unknown_providers: number;
  duplicate_intelligence: number;
  duplicate_alerts: number;
  errors: number;
  writes_attempted: number;
  catalyst_events_writes: number;
}

export function emptyScoreBuckets(): ScoreBuckets {
  return { "80_100": 0, "60_79": 0, "40_59": 0, "0_39": 0 };
}

export function emptyTelemetry(
  mode: "dry_run" | "write",
  rulesVersion: string,
  startedAt: string,
): ProcessorTelemetry {
  return {
    mode,
    rules_version: rulesVersion,
    started_at: startedAt,
    completed_at: startedAt,
    events_scanned: 0,
    events_processed: 0,
    events_skipped: 0,
    provider_counts: {},
    class_counts: {},
    score_buckets: emptyScoreBuckets(),
    alerts_qualified: 0,
    alerts_suppressed: 0,
    unknown_providers: 0,
    duplicate_intelligence: 0,
    duplicate_alerts: 0,
    errors: 0,
    writes_attempted: 0,
    catalyst_events_writes: 0,
  };
}

export function scoreBucket(score: number): keyof ScoreBuckets {
  if (score >= 80) return "80_100";
  if (score >= 60) return "60_79";
  if (score >= 40) return "40_59";
  return "0_39";
}

export function increment(map: Record<string, number>, key: string): void {
  const safe = key.trim().length > 0 ? key : "unknown";
  map[safe] = (map[safe] ?? 0) + 1;
}

export function recordScore(telemetry: ProcessorTelemetry, score: number): void {
  telemetry.score_buckets[scoreBucket(score)] += 1;
}
