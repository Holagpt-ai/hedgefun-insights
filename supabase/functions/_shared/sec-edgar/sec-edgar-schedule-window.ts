/**
 * Eastern Time ingestion window for unattended SEC sync (Gate I.3).
 * Weekdays only, 4:00 AM inclusive through 10:00 PM exclusive (America/New_York).
 */

export const SEC_EDGAR_SCHEDULE_TZ = "America/New_York";
export const SEC_EDGAR_WINDOW_START_MINUTES = 4 * 60;
export const SEC_EDGAR_WINDOW_END_MINUTES = 22 * 60;

export type EtLocalParts = {
  weekday: number;
  minutesSinceMidnight: number;
};

/** Extract ET calendar weekday (1=Mon … 7=Sun) and minutes since local midnight. */
export function etLocalPartsFromInstant(instant: Date): EtLocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: SEC_EDGAR_SCHEDULE_TZ,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(instant);
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const weekdayMap: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return {
    weekday: weekdayMap[weekdayStr] ?? 0,
    minutesSinceMidnight: hour * 60 + minute,
  };
}

export function isSecEdgarScheduledIngestionWindow(instant: Date): boolean {
  const { weekday, minutesSinceMidnight } = etLocalPartsFromInstant(instant);
  if (weekday < 1 || weekday > 5) return false;
  if (minutesSinceMidnight < SEC_EDGAR_WINDOW_START_MINUTES) return false;
  if (minutesSinceMidnight >= SEC_EDGAR_WINDOW_END_MINUTES) return false;
  return true;
}
