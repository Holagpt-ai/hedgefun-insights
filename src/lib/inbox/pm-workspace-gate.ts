import { PM_GATE_THRESHOLD_MINS } from "@/config/inbox.config";
import { getEtParts, getRegularCloseMins, isTradingDay } from "@/lib/market-calendar";
import { resolvePmApplicableTradingDate } from "@/lib/inbox/pm-session-evidence";

/** Minutes from ET midnight when PM workspace sections unlock (3:00 PM ET, or earlier on scheduled early closes). */
export function pmWorkspaceUnlockMins(applicableTradingDate: string): number {
  const closeMins = getRegularCloseMins(applicableTradingDate);
  return Math.min(PM_GATE_THRESHOLD_MINS, closeMins);
}

export function formatEtMinsLabel(mins: number): string {
  const hour24 = Math.floor(mins / 60);
  const minute = mins % 60;
  const meridiem = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${meridiem} ET`;
}

export function formatPmWorkspaceUnlockEtLabel(applicableTradingDate: string): string {
  return formatEtMinsLabel(pmWorkspaceUnlockMins(applicableTradingDate));
}

/** Human-readable official regular close for copy that references the exchange calendar. */
export function formatRegularCloseEtLabel(tradingDate: string): string {
  return formatEtMinsLabel(getRegularCloseMins(tradingDate));
}

/** True while full After-Hours workspace sections remain gated before the workspace unlock threshold. */
export function pmWorkspaceSectionsLocked(nowMs = Date.now()): boolean {
  const et = getEtParts(new Date(nowMs));
  if (!isTradingDay(et.date, et.weekday)) {
    return false;
  }
  const { applicableTradingDate } = resolvePmApplicableTradingDate(nowMs);
  const unlockMins = pmWorkspaceUnlockMins(applicableTradingDate);
  return et.minutes < unlockMins;
}

export interface PmWorkspaceGatePresentation {
  locked: boolean;
  applicableTradingDate: string;
  consumerEtDate: string;
  consumerIsTradingDay: boolean;
  unlockLabel: string;
  officialCloseLabel: string;
  title: string;
  body: string;
  modalBody: string;
}

export function resolvePmWorkspaceGate(nowMs = Date.now()): PmWorkspaceGatePresentation {
  const session = resolvePmApplicableTradingDate(nowMs);
  const et = getEtParts(new Date(nowMs));
  const consumerIsTradingDay = isTradingDay(et.date, et.weekday);
  const unlockMins = pmWorkspaceUnlockMins(session.applicableTradingDate);
  const unlockLabel = formatEtMinsLabel(unlockMins);
  const officialCloseLabel = formatRegularCloseEtLabel(session.applicableTradingDate);
  const scheduledEarlyClose = unlockMins < PM_GATE_THRESHOLD_MINS;
  const locked = pmWorkspaceSectionsLocked(nowMs);

  const title = consumerIsTradingDay
    ? `Additional workspace available after ${unlockLabel}`
    : "After-Hours workspace";

  const body = consumerIsTradingDay
    ? `Recap tools, catalyst outcomes, and after-hours watch become available at ${unlockLabel}`
      + (scheduledEarlyClose
        ? ` (scheduled early close at ${officialCloseLabel})`
        : "")
      + ". The AI Brief follows the official market schedule."
    : "Markets are closed for this session. Recap and workflow sections are available without a regular-session time gate. Radar and scanner highlights follow preserved-session rules — prior-session data is not presented as today's live market.";

  const modalBody = consumerIsTradingDay
    ? `Additional After-Hours workspace sections become available at ${unlockLabel}. AI Brief availability follows the official market schedule.`
    : "Markets are closed today. Additional workspace sections are available; live session scanners may show preserved or prior-session evidence only.";

  return {
    locked,
    applicableTradingDate: session.applicableTradingDate,
    consumerEtDate: session.consumerEtDate,
    consumerIsTradingDay,
    unlockLabel,
    officialCloseLabel,
    title,
    body,
    modalBody,
  };
}

/** @deprecated Prefer `resolvePmWorkspaceGate` for a single presentation source. */
export function pmWorkspaceLockedCopy(nowMs = Date.now()): { title: string; body: string } {
  const gate = resolvePmWorkspaceGate(nowMs);
  return { title: gate.title, body: gate.body };
}