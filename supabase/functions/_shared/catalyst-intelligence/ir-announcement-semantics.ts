/** IR feed semantics: announcement vs schedule-only calendar disclosure. */

const EARNINGS_RESULTS =
  /\b(reports (its )?(first|second|third|fourth|q[1-4]|quarterly|annual|fiscal|full[- ]year).{0,25}(results|earnings)\b|\b(quarterly|annual|fiscal|q[1-4]|fourth quarter|full[- ]year).{0,20}(results|earnings)\b|\bearnings results\b|\bfinancial results for\b|\bannounced (its )?(q[1-4]|fourth quarter|full[- ]year|fiscal year).{0,20}(results|earnings)\b)/i;

const EARNINGS_SCHEDULE =
  /\b(announces date for|to report (its )?(q[1-4]|fourth quarter|results|earnings)|will report (its )?(q[1-4]|results|earnings)|scheduled to report (its )?(results|earnings|q[1-4]))\b/i;

export type IrEarningsDisposition = "results_reported" | "schedule_announced" | null;

/** Distinguish reported earnings from a schedule-only or date-announcement disclosure. */
export function classifyIrEarningsDisposition(text: string): IrEarningsDisposition {
  if (/\bannounces date for\b/i.test(text) || /\bwill report\b/i.test(text) || /\bscheduled to report\b/i.test(text)) {
    return "schedule_announced";
  }
  if (EARNINGS_RESULTS.test(text)) return "results_reported";
  if (EARNINGS_SCHEDULE.test(text)) return "schedule_announced";
  return null;
}

const ANNOUNCEMENT_VERBS =
  /\b(announces|announced|launches|launched|unveils|files (form )?8-k|merger|acquire[sd]?|partnership|guidance|outlook|to present|will present|will host|hosts|hosting|reports (its )?(q[1-4]|results|earnings))\b/i;

/**
 * Whether IR content represents a corporate announcement (vs a bare future calendar slot).
 * Schedule-only items keep scheduled fields but avoid treating the event as already announced.
 */
export function resolveIrIsAnnouncement(
  text: string,
  hasExplicitSchedule: boolean,
): boolean {
  if (EARNINGS_RESULTS.test(text) || EARNINGS_SCHEDULE.test(text)) return true;
  if (ANNOUNCEMENT_VERBS.test(text)) return true;
  if (hasExplicitSchedule && !ANNOUNCEMENT_VERBS.test(text)) return false;
  return true;
}
