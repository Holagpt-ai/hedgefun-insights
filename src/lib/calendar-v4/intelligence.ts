import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import type { WatchlistAIAnalysis } from "@/hooks/useWatchlistAI";
import { CALENDAR_AI_BRIEF } from "@/lib/calendar-v4/customer-copy";

export interface CalendarDayBriefModel {
  mode: "cached" | "factual";
  title: string;
  badge: string;
  bullets: string[];
  footnote: string;
}

export interface WeekSnapshotRow {
  date: string;
  label: string;
  highImpact: number;
  earnings: number;
  macro: number;
}

function topSymbols(events: CalendarV4Event[], limit = 6): string[] {
  return [...new Set(events.flatMap((e) => e.symbols.map((s) => s.toUpperCase())))].slice(0, limit);
}

export function buildCalendarDayBrief(
  day: string,
  events: CalendarV4Event[],
  cached: Record<string, WatchlistAIAnalysis>,
): CalendarDayBriefModel {
  if (!events.length) {
    return {
      mode: "factual",
      title: CALENDAR_AI_BRIEF.factualTitle,
      badge: CALENDAR_AI_BRIEF.factualBadge,
      bullets: [`No verified events on ${day} for the active filters.`],
      footnote: CALENDAR_AI_BRIEF.noCached,
    };
  }

  const high = events.filter((e) => e.hasImpactEvidence && e.impact === "high");
  const symbols = topSymbols(events);
  const cachedLines: string[] = [];

  for (const sym of symbols) {
    const row = cached[sym];
    if (!row?.summary?.trim()) continue;
    cachedLines.push(`${sym}: ${row.summary.trim()}`);
    if (cachedLines.length >= 3) break;
  }

  const factualBullets: string[] = [];
  if (high.length) {
    factualBullets.push(
      `${high.length} high-impact ${high.length === 1 ? "event" : "events"}: ${high
        .slice(0, 3)
        .map((e) => e.title)
        .join("; ")}${high.length > 3 ? "…" : ""}`,
    );
  }
  const earnings = events.filter((e) => e.feedType === "earnings").length;
  const macro = events.filter((e) => e.feedType === "economic").length;
  if (earnings) factualBullets.push(`${earnings} earnings ${earnings === 1 ? "release" : "releases"} on the schedule.`);
  if (macro) factualBullets.push(`${macro} macro ${macro === 1 ? "release" : "releases"} on the schedule.`);
  if (symbols.length) factualBullets.push(`Tickers in focus: ${symbols.join(", ")}.`);

  if (cachedLines.length) {
    return {
      mode: "cached",
      title: CALENDAR_AI_BRIEF.cachedTitle,
      badge: CALENDAR_AI_BRIEF.cachedBadge,
      bullets: [...cachedLines, ...factualBullets.slice(0, 2)],
      footnote: "Summaries are from cached watchlist analysis only — not generated on this page load.",
    };
  }

  return {
    mode: "factual",
    title: CALENDAR_AI_BRIEF.factualTitle,
    badge: CALENDAR_AI_BRIEF.factualBadge,
    bullets: factualBullets,
    footnote: CALENDAR_AI_BRIEF.noCached,
  };
}

export function buildWeekSnapshot(events: CalendarV4Event[], anchorIso: string): WeekSnapshotRow[] {
  const anchor = new Date(`${anchorIso}T12:00:00`);
  const rows: WeekSnapshotRow[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dayEvents = events.filter((e) => e.eventDate === iso);
    rows.push({
      date: iso,
      label: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      }),
      highImpact: dayEvents.filter((e) => e.hasImpactEvidence && e.impact === "high").length,
      earnings: dayEvents.filter((e) => e.feedType === "earnings").length,
      macro: dayEvents.filter((e) => e.feedType === "economic").length,
    });
  }
  return rows;
}