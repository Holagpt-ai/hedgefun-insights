import type { NormalizedEventCandidate, TimingBucket } from "./types.ts";

export interface NormalizedTiming {
  scheduledStart: string | null;
  scheduledEnd: string | null;
  scheduledDate: string | null;
  publishedAt: string | null;
  bucket: TimingBucket;
  effectiveAt: string | null;
}

function etParts(iso: string): { minutes: number; weekday: number } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const parts = fmt.formatToParts(new Date(ms));
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  const minute = Number(parts.find((p) => p.type === "minute")?.value);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const dayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { minutes: hour * 60 + minute, weekday: dayIndex[weekday] ?? 0 };
}

/** Session bucket from a known UTC timestamp. Missing timestamps stay unknown. */
export function timingBucketForInstant(iso: string | null, now: Date): TimingBucket {
  if (!iso) return "unknown";
  const when = Date.parse(iso);
  if (!Number.isFinite(when)) return "unknown";
  if (when - now.getTime() > 12 * 60 * 60 * 1000) return "scheduled_future";
  const et = etParts(iso);
  if (!et) return "unknown";
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  if (et.weekday === 0 || et.weekday === 6) return "next_session";
  if (et.minutes < open) return "premarket";
  if (et.minutes >= close) return "after_hours";
  if (when <= now.getTime() + 15 * 60 * 1000) return "immediate";
  return "regular_session";
}

export function normalizeTiming(candidate: NormalizedEventCandidate, now: Date): NormalizedTiming {
  const scheduledStart = candidate.scheduledStart;
  const scheduledEnd = candidate.scheduledEnd;
  const scheduledDate = candidate.scheduledDate;
  const publishedAt = candidate.raw.publishedAt;
  let bucket: TimingBucket = "unknown";
  if (scheduledStart && Date.parse(scheduledStart) > now.getTime()) bucket = "scheduled_future";
  else if (scheduledDate && scheduledDate > now.toISOString().slice(0, 10)) bucket = "scheduled_future";
  else if (candidate.isAnnouncement) bucket = timingBucketForInstant(publishedAt, now);
  else bucket = timingBucketForInstant(publishedAt ?? scheduledStart, now);
  const effectiveAt = candidate.isAnnouncement
    ? publishedAt
    : scheduledStart;
  return { scheduledStart, scheduledEnd, scheduledDate, publishedAt, bucket, effectiveAt };
}
