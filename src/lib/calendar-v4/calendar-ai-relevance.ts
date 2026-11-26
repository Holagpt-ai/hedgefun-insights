import { etTodayParts } from "@/lib/homepage/calendar-month";

/** Cached watchlist analysis is general ticker context — only show near the selected calendar day. */
export function isCachedAnalysisRelevantForCalendarDay(
  selectedDate: string,
  analyzedAt: string | null | undefined,
  maxDayDelta = 2,
): boolean {
  if (!analyzedAt) return false;
  const today = etTodayParts().iso;
  const anchor = selectedDate;
  const dayDelta = Math.abs(
    Math.round(
      (Date.parse(`${anchor}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000,
    ),
  );
  if (dayDelta > maxDayDelta) return false;
  const analyzedMs = Date.parse(analyzedAt);
  if (Number.isNaN(analyzedMs)) return false;
  const ageDays = Math.round((Date.now() - analyzedMs) / 86_400_000);
  return ageDays <= 14;
}