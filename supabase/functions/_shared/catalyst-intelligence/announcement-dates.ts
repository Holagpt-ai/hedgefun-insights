import { toIsoDate } from "./normalize.ts";

export interface ExtractedSchedule {
  scheduledStart: string | null;
  scheduledDate: string | null;
}

const MONTH =
  "(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";

const MONTH_NUM: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

/**
 * Deterministic explicit calendar dates in IR announcement text.
 * Does not infer missing components or use AI.
 */
export function extractExplicitScheduledDates(
  text: string,
  publishedAt: string | null,
): ExtractedSchedule {
  const match = text.match(
    new RegExp(`\\b${MONTH}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,\\s*(\\d{4}))?\\b`, "i"),
  );
  if (!match) return { scheduledStart: null, scheduledDate: null };

  const monthKey = match[1].toLowerCase().replace(/\.$/, "");
  const month = MONTH_NUM[monthKey];
  const day = Number(match[2]);
  const explicitYear = match[3] ? Number(match[3]) : null;
  if (!month || !Number.isFinite(day) || day < 1 || day > 31) {
    return { scheduledStart: null, scheduledDate: null };
  }

  const pubYear = publicationYear(publishedAt);
  const year = explicitYear ?? pubYear;
  if (!year || !Number.isFinite(year)) return { scheduledStart: null, scheduledDate: null };

  const ymd = toIsoDate(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  if (!ymd) return { scheduledStart: null, scheduledDate: null };

  if (!explicitYear && publishedAt) {
    const pubDay = toIsoDate(publishedAt.slice(0, 10));
    if (pubDay && ymd < pubDay) return { scheduledStart: null, scheduledDate: null };
  }

  return { scheduledStart: null, scheduledDate: ymd };
}

function publicationYear(publishedAt: string | null): number | null {
  if (!publishedAt) return null;
  const ms = Date.parse(publishedAt);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).getUTCFullYear();
}
