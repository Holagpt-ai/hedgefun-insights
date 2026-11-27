import { getEtParts, getRegularCloseMins } from "@/lib/market-calendar";
import { resolvePmApplicableTradingDate } from "@/lib/inbox/pm-session-evidence";

/** True while full After-Hours workspace sections remain gated (before regular-session close ET). */
export function pmWorkspaceSectionsLocked(nowMs = Date.now()): boolean {
  const { applicableTradingDate } = resolvePmApplicableTradingDate(nowMs);
  const closeMins = getRegularCloseMins(applicableTradingDate);
  const et = getEtParts(new Date(nowMs));
  return et.minutes < closeMins;
}

/** Human-readable regular close for PM Inbox copy (respects early-close calendar). */
export function formatRegularCloseEtLabel(tradingDate: string): string {
  const closeMins = getRegularCloseMins(tradingDate);
  const hour24 = Math.floor(closeMins / 60);
  const minute = closeMins % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const mins = `:${String(minute).padStart(2, "0")}`;
  return `${hour12}${mins} ${meridiem} ET`;
}

export function pmWorkspaceLockedCopy(nowMs = Date.now()): {
  title: string;
  body: string;
} {
  const { applicableTradingDate } = resolvePmApplicableTradingDate(nowMs);
  const closeLabel = formatRegularCloseEtLabel(applicableTradingDate);
  return {
    title: `Additional workspace available after ${closeLabel}`,
    body:
      `Recap tools, catalyst outcomes, and after-hours watch become available after the official regular-session close (${closeLabel}, including scheduled early closes). The AI Brief follows the official market schedule.`,
  };
}