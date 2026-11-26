import type { CalendarV4Event } from "@/lib/calendar-v4/contract";

export interface CalendarDayBriefSection {
  headline: string;
  bullets: string[];
  pending: boolean;
}

/** Factual day brief from verified events only — no live Anthropic calls. */
export function buildCalendarDayBrief(
  day: string,
  events: CalendarV4Event[],
): CalendarDayBriefSection {
  if (!events.length) {
    return {
      headline: `No scheduled catalysts for ${day}`,
      bullets: ["Select another date or widen filters to see macro and earnings coverage."],
      pending: false,
    };
  }

  const high = events.filter((e) => e.hasImpactEvidence && e.impact === "high");
  const earnings = events.filter((e) => e.feedType === "earnings");
  const macro = events.filter((e) => e.feedType === "economic");
  const symbols = [...new Set(events.flatMap((e) => e.symbols))].slice(0, 12);

  const bullets: string[] = [];
  if (high.length) {
    bullets.push(`${high.length} high-impact item${high.length === 1 ? "" : "s"}: ${high.map((e) => e.title).slice(0, 3).join("; ")}${high.length > 3 ? "…" : ""}`);
  }
  if (earnings.length) {
    bullets.push(`${earnings.length} earnings release${earnings.length === 1 ? "" : "s"} scheduled.`);
  }
  if (macro.length) {
    bullets.push(`${macro.length} macro release${macro.length === 1 ? "" : "s"} on the calendar.`);
  }
  if (symbols.length) {
    bullets.push(`Securities in focus: ${symbols.join(", ")}.`);
  }
  bullets.push("Cached AI Analyst summaries appear when available for individual events.");

  return {
    headline: high.length ? "High-impact agenda" : "Today's catalyst agenda",
    bullets,
    pending: false,
  };
}

export interface WeekSnapshotRow {
  date: string;
  label: string;
  highImpact: number;
  earnings: number;
  macro: number;
}

export function buildWeekSnapshot(
  events: CalendarV4Event[],
  anchorIso: string,
): WeekSnapshotRow[] {
  const anchor = new Date(`${anchorIso}T12:00:00`);
  const rows: WeekSnapshotRow[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(anchor);
    d.setDate(anchor.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dayEvents = events.filter((e) => e.eventDate === iso);
    rows.push({
      date: iso,
      label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" }),
      highImpact: dayEvents.filter((e) => e.hasImpactEvidence && e.impact === "high").length,
      earnings: dayEvents.filter((e) => e.feedType === "earnings").length,
      macro: dayEvents.filter((e) => e.feedType === "economic").length,
    });
  }
  return rows;
}