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

export const CATALYST_PILLS: CatalystPill[] = [
  { label: "NVDA earnings tonight", tier: "free", priority: "High", note: "Options imply 8.2% move" },
  { label: "CPI data 8:30 AM", tier: "free", priority: "High", note: "Volatility trigger pre-open" },
  { label: "FOMC minutes 2:00 PM", tier: "pro", priority: "Medium", note: "Rate path guidance" },
  { label: "Fed Chair speech 10:00 AM", tier: "pro", priority: "Medium", note: "Watch for dovish pivot" },
  { label: "Options expiry — NVDA", tier: "pro", priority: "Low", note: "Weekly OpEx flow" },
];

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

export const AM_OVERNIGHT_MOVERS: StaticInboxItem[] = [
  { label: "TSLA", detail: "+3.2% overnight · China delivery beat", priority: "High", badge: "Gainer" },
  { label: "AAPL", detail: "-1.4% overnight · Supply chain note", priority: "Medium", badge: "Decliner" },
  { label: "NVDA", detail: "+1.1% overnight · Ahead of earnings", priority: "Medium", badge: "Watch" },
];

export const AM_RISK_FLAGS: StaticInboxItem[] = [
  { label: "VIX curve steepening", detail: "Front-month VIX +6% pre-open", priority: "High", badge: "Vol" },
  { label: "10Y yield spike", detail: "Above 4.5% — pressure on growth", priority: "Medium", badge: "Rates" },
  { label: "USD strength", detail: "DXY at 3-week highs", priority: "Low", badge: "FX" },
];

export const AM_OPENING_BELL_CHECKLIST: string[] = [
  "Review overnight news and futures",
  "Check watchlist gap-ups / gap-downs",
  "Set alerts on key catalysts",
  "Confirm risk limits for the day",
  "Log open orders in journal",
];

export const PM_TODAYS_KEY_MOVES: StaticInboxItem[] = [
  { label: "SPY", detail: "Closed +0.6% · Broad rally", priority: "Medium", badge: "Index" },
  { label: "NVDA", detail: "+4.1% into earnings", priority: "High", badge: "Mover" },
  { label: "XLE", detail: "-1.8% on crude weakness", priority: "Medium", badge: "Sector" },
];

export const PM_TOMORROW_SETUP: StaticInboxItem[] = [
  { label: "Jobless claims 8:30 AM", detail: "Consensus 220k", priority: "Medium", badge: "Macro" },
  { label: "MSFT earnings AMC", detail: "Cloud growth in focus", priority: "High", badge: "Earnings" },
  { label: "Powell speech 1:00 PM", detail: "Watch rate commentary", priority: "High", badge: "Fed" },
];

export const PM_AFTER_HOURS_WATCH: StaticInboxItem[] = [
  { label: "META", detail: "Guidance call at 5:00 PM", priority: "High", badge: "Watch" },
  { label: "AMZN", detail: "AWS revenue watch", priority: "Medium", badge: "Earnings" },
  { label: "SNAP", detail: "Ad market read-through", priority: "Low", badge: "Watch" },
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
  title: "AM Inbox",
  subtitle: "Pre-market briefing — updated before every open",
  aiCardTitle: "✦ AI Morning Brief",
  aiCardGateHeading: "AI Morning Brief — PRO Feature",
  aiCardGateBody:
    "Daily AI-powered market intelligence personalized to your watchlist. Generated before every open using Opus 4.7.",
  aiCardPlaceholderText:
    "Markets are showing resilience this morning as futures point slightly higher. The Fed's latest commentary suggests a dovish pivot may be closer than expected, with bond yields pulling back from recent highs. NVDA earnings after close are the key catalyst to watch — options pricing implies an 8.2% move. CPI data at 8:30 AM ET could be a volatility trigger.",
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
  title: "PM Inbox",
  subtitle: "Post-market briefing — available after 3:00 PM ET",
  gateModalIcon: "🌙",
  gateModalTitle: "Post-Market Report",
  gateModalBody:
    "The PM Inbox is available after 3:00 PM ET. We'll notify you when your post-market briefing is ready.",
  gateModalCta: "Got it",
  lockedCardIcon: "🌙",
  lockedCardTitle: "Available after 3:00 PM ET",
  lockedCardBody: "Your post-market briefing will be ready after markets close.",
  aiCardGateHeading: "PM Inbox — PRO Feature",
  aiCardGateBody:
    "Upgrade to access your daily post-market AI briefing, recap, and after-hours movers. Available on PRO.",
  upgradeCta: "Unlock PRO — $5/month",
  aiCardTitle: "✦ AI Evening Brief",
  aiCardPlaceholderText:
    "In the live product, your AI-generated post-market briefing appears here after 3:00 PM ET.",
  aiCardTimestampLabel: "Generated at",
  recapHeading: "Post-Market Recap",
  recapSubtitle: "Today's session distilled — generated after the close",
  catalystOutcomesHeading: "Catalyst Outcomes · Preview Signals",
  catalystOutcomesSubtitle: "Static preview — full live catalyst feed in Catalyst module",
  earningsHeading: "After-Close Earnings",
  keyMovesHeading: "Today's Key Moves",
  keyMovesEmpty: "No standout moves today.",
  tomorrowSetupHeading: "Tomorrow's Setup",
  tomorrowSetupEmpty: "No scheduled catalysts for tomorrow.",
  afterHoursHeading: "After-Hours Watch",
  afterHoursEmpty: "No after-hours events flagged.",
  newsHeading: "Market Headlines",
};
