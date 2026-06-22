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
}

export const CATALYST_PILLS: CatalystPill[] = [
  { label: "NVDA earnings tonight", tier: "free" },
  { label: "CPI data 8:30 AM", tier: "free" },
  { label: "FOMC minutes 2:00 PM", tier: "pro" },
  { label: "Fed Chair speech 10:00 AM", tier: "pro" },
  { label: "Options expiry — NVDA", tier: "pro" },
];

export const PM_CATALYST_PILLS: CatalystPill[] = [
  { label: "After-hours movers loading", tier: "free" },
  { label: "Today's market recap", tier: "free" },
  { label: "Tomorrow's economic calendar", tier: "pro" },
  { label: "Sector rotation recap", tier: "pro" },
  { label: "After-hours options flow", tier: "pro" },
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
  upgradeCta: "Unlock PRO — $5/month",
  upgradeLink: "View all PRO features →",
} satisfies AIBriefConfig & {
  title: string;
  subtitle: string;
  upgradeLink: string;
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
};
