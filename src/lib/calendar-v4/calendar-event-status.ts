import type { CatalystEvent } from "@/types/catalyst";
import type { CalendarV4EventStatus } from "@/lib/calendar-v4/contract";
import type { EconomicCalendarRow } from "@/lib/calendar-v4/economic-types";
import {
  buildCatalystSourceEvidenceSummary,
  isScheduleOnlyEarningsEvidence,
} from "@/lib/catalyst/source-evidence-contract";

function factsRecord(event: CatalystEvent): Record<string, unknown> {
  return event.facts && typeof event.facts === "object" && !Array.isArray(event.facts)
    ? (event.facts as Record<string, unknown>)
    : {};
}

function readFactStatus(facts: Record<string, unknown>): string | null {
  const raw = facts.status;
  return typeof raw === "string" ? raw.trim().toLowerCase() : null;
}

/** Evidence-backed lifecycle — not date-only inference. */
export function resolveCatalystCalendarStatus(
  event: CatalystEvent,
  nowMs = Date.now(),
): CalendarV4EventStatus {
  const facts = factsRecord(event);
  const factStatus = readFactStatus(facts);
  if (factStatus === "cancelled" || factStatus === "canceled") return "cancelled";

  if (facts.earnings_disposition === "results_reported") return "reported";
  if (facts.reported_at || facts.actual_eps != null || facts.eps != null) return "reported";

  const summary = buildCatalystSourceEvidenceSummary(event, nowMs);
  if (isScheduleOnlyEarningsEvidence(summary, nowMs)) return "scheduled";
  if (facts.earnings_disposition === "schedule_announced") return "scheduled";
  if (summary.publishedState === "present") return "reported";

  return "unknown";
}

export function resolveEconomicCalendarStatus(
  row: EconomicCalendarRow,
  _etToday: string,
): CalendarV4EventStatus {
  if (row.actual_value != null && row.actual_value !== "") {
    return row.actual_reported_at ? "reported" : "reported";
  }
  if (row.actual_reported_at) return "reported";
  return "scheduled";
}