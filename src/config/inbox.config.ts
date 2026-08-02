// src/config/inbox.config.ts
// Single source of truth for AM/PM Inbox behavior, thresholds, and copy.
// To change any inbox behavior, edit this file only — components are thin renderers.

export type DotColor = "green" | "amber" | "gray";
export type MarketSessionId = "pre-market" | "market" | "after-hours" | "closed";

export interface MarketSession {
  id: MarketSessionId;
  label: string;
  dot: DotColor;
  /** Minutes from midnight ET at which the countdown ends. null = no countdown (closed). */
  countdownTargetMins: number | null;
  subLabel: string;
  /** Inclusive start of session window in minutes from midnight ET. null = catch-all (closed). */
  rangeStart: number | null;
  /** Inclusive end of session window in minutes from midnight ET. null = catch-all (closed). */
  rangeEnd: number | null;
}

export const MARKET_SESSIONS: MarketSession[] = [
  {
    id: "pre-market",
    label: "PRE-MARKET · OPENS IN",
    dot: "amber",
    countdownTargetMins: 570,
    subLabel: "Market opens 9:30 AM ET",
    rangeStart: 240,
    rangeEnd: 569,
  },
  {
    id: "market",
    label: "MARKET OPEN · CLOSES IN",
    dot: "green",
    countdownTargetMins: 960,
    subLabel: "Market closes 4:00 PM ET",
    rangeStart: 570,
    rangeEnd: 959,
  },
  {
    id: "after-hours",
    label: "AFTER-HOURS · CLOSES IN",
    dot: "amber",
    countdownTargetMins: 1200,
    subLabel: "After-hours 4:00 PM – 8:00 PM ET",
    rangeStart: 960,
    rangeEnd: 1199,
  },
  {
    id: "closed",
    label: "MARKET CLOSED",
    dot: "gray",
    countdownTargetMins: null,
    subLabel: "Pre-market opens 4:00 AM ET",
    rangeStart: null,
    rangeEnd: null,
  },
];

/** Minutes from midnight ET at which PM Inbox unlocks. */
export const PM_GATE_THRESHOLD_MINS = 900; // 3:00 PM ET

/** Minutes from midnight ET at which the AM Brief is considered stale. */
export const AM_BRIEF_STALE_MINS = 900; // 3:00 PM ET

/** Minutes from midnight ET at which the PM Brief is considered stale. */
export const PM_BRIEF_STALE_MINS = 1440; // midnight ET

export interface CatalystPill {
  label: string;
  tier: "free" | "pro";
  /** Visual-only priority — never used for access control. */
  priority?: "High" | "Medium" | "Low";
  note?: string;
}

// NOTE: AM (Pre-Market) fabricated preview constants were removed when the
// Pre-Market page became a production data workspace. PM/After-Hours constants
// below remain until After-Hours is rebuilt in its own sprint.

export const PM_CATALYST_PILLS: CatalystPill[] = [
  { label: "After-hours movers preview", tier: "free", priority: "High", note: "Post-close price action" },
  { label: "Today's market recap", tier: "free", priority: "Medium", note: "Sector winners/losers" },
  { label: "Tomorrow's economic calendar", tier: "pro", priority: "High", note: "Setup for next open" },
  { label: "Sector rotation recap", tier: "pro", priority: "Medium", note: "Flow shifts today" },
  { label: "After-hours options flow", tier: "pro", priority: "Low", note: "Unusual activity scan" },
];

export interface StaticInboxItem {
  label: string;
  detail: string;
  priority?: "High" | "Medium" | "Low";
  badge?: string;
}

// NOTE: The three lists below are workflow scaffolding only. They must never
// contain ticker-specific prices, percentage moves, volumes, rankings, or
// named catalysts — no market claim may originate from this file.

export const PM_TODAYS_KEY_MOVES: StaticInboxItem[] = [
  {
    label: "Review the session's biggest moves",
    detail: "Open Screeners or Action Center for provider-backed movers. No market results are shown here.",
    badge: "Workflow",
  },
  {
    label: "Tag what mattered",
    detail: "Send any symbol you reviewed to AI Analyst, Catalyst, Watchlist, or Journal.",
    badge: "Workflow",
  },
];

export const PM_TOMORROW_SETUP: StaticInboxItem[] = [
  {
    label: "Check the next session's scheduled events",
    detail: "Use Catalyst and the earnings section above for dated, provider-supplied events.",
    badge: "Workflow",
  },
  {
    label: "Shortlist the symbols you'll watch",
    detail: "Add candidates to your Watchlist so they're ready before the next open.",
    badge: "Workflow",
  },
];

export const PM_AFTER_HOURS_WATCH: StaticInboxItem[] = [
  {
    label: "Follow up on after-hours reporters",
    detail: "Confirm reported results in Catalyst once the provider publishes them.",
    badge: "Workflow",
  },
  {
    label: "Write down the plan, not the outcome",
    detail: "Log your reasoning in Stock Journal while the session is still fresh.",
    badge: "Workflow",
  },
];

export interface AIBriefConfig {
  aiCardTitle: string;
  aiCardGateHeading: string;
  aiCardGateBody: string;
  aiCardPlaceholderText: string;
  upgradeCta: string;
  aiCardTimestampLabel?: string;
  upgradeLink?: string;
}

export const AM_INBOX_CONFIG = {
  title: "Pre-Market",
  subtitle: "Pre-market briefing — updated before every open",
  aiCardTitle: "✦ AI Morning Brief",
  aiCardGateHeading: "AI Morning Brief — PRO Feature",
  aiCardGateBody:
    "A shared AI market brief grounded in SPY, QQQ, DIA, and IWM.",
  aiCardPlaceholderText:
    "Your market brief will appear here when available.",

  aiCardTimestampLabel: "Generated at",
  upgradeCta: "Request Pro Access",
  upgradeLink: "View all PRO features →",
  commandBriefHeading: "Pre-Market Command Brief",
  commandBriefSubtitle: "Your morning intelligence, generated fresh before every open",
  catalystWatchHeading: "Catalyst Watch · Preview Signals",
  catalystWatchSubtitle: "Static preview — full live catalyst feed in Catalyst module",
  earningsHeading: "Before-Open Earnings",
  overnightMoversHeading: "Overnight Movers · Watchlist Setup",
  overnightMoversEmpty: "No overnight movers flagged.",
  riskFlagsHeading: "Risk Flags",
  riskFlagsEmpty: "No elevated risk flags this morning.",
  checklistHeading: "Opening Bell Checklist",
  checklistSubtitle: "Local session only — resets on refresh",
  newsHeading: "Market Headlines",
};

export const PM_INBOX_CONFIG = {
  title: "After-Hours",
  subtitle: "AI briefing and post-market workflow",
  gateModalIcon: "🌙",
  gateModalTitle: "After-Hours Workspace",
  gateModalBody:
    "Additional After-Hours workspace sections become available at 3:00 PM ET. AI Brief availability follows the official market schedule.",
  gateModalCta: "Got it",
  lockedCardIcon: "🌙",
  lockedCardTitle: "Additional workspace available at 3:00 PM ET",
  lockedCardBody:
    "Recap tools, catalyst outcomes, and after-hours watch become available at 3:00 PM ET. The AI Brief follows the official market schedule.",
  aiCardGateHeading: "After-Hours — PRO Feature",
  aiCardGateBody:
    "Upgrade to access your daily post-market AI briefing, recap, and after-hours movers. Available on PRO.",
  upgradeCta: "Request Pro Access",
  aiCardTitle: "✦ AI Evening Brief",
  aiCardPlaceholderText:
    "Your post-market brief will appear here when available.",

  aiCardTimestampLabel: "Generated at",
  recapHeading: "Post-Market Recap",
  recapSubtitle: "End-of-day review and planning",
  catalystOutcomesHeading: "Catalyst Outcomes · Preview Signals",
  catalystOutcomesSubtitle: "Static preview — continue the workflow in the Catalyst module",
  earningsHeading: "Upcoming After-Close Earnings",
  keyMovesHeading: "Session Review Workflow",
  keyMovesEmpty: "No workflow steps configured.",
  tomorrowSetupHeading: "Next-Session Preparation Workflow",
  tomorrowSetupEmpty: "No workflow steps configured.",
  afterHoursHeading: "After-Hours Follow-Up Workflow",
  afterHoursEmpty: "No workflow steps configured.",
  previewDisclosure:
    "Workflow guidance only — no provider-backed market results are displayed in this section.",
  newsHeading: "Market Headlines",
};
