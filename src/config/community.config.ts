export const COMMUNITY_WAITLIST_SOURCE = "community_waitlist";

export const COMMUNITY_COPY = {
  title: "Community",
  badge: "Coming soon",
  subtitle:
    "A future space for educational market discussion, trade reviews, and idea sharing.",
  trustBanner:
    "Community is coming soon. When launched, discussion will be educational only and moderated to reduce spam, hype, harassment, and coordinated promotion. Nothing shared in Community should be treated as financial advice.",
  waitlistNote:
    "You may receive the existing HedgeFun welcome email after joining.",
  footerDisclaimer:
    "Community is not live yet. Future content will be for educational discussion only. Not financial advice.",
};

export const COMMUNITY_RULES: string[] = [
  "Educational discussion only.",
  "Not financial advice.",
  "No pump-and-dump or coordinated promotion.",
  "No harassment, hate, threats, or spam.",
  "No misleading claims or fake performance screenshots.",
  "Use source links when discussing news or catalysts.",
  "Future posts may be reviewed, hidden, or removed.",
];

export interface CommunityPreviewSection {
  title: string;
  description: string;
}

export const COMMUNITY_PREVIEW_SECTIONS: CommunityPreviewSection[] = [
  { title: "Trade Reviews",         description: "Share closed trades and get respectful, educational feedback on setups and execution." },
  { title: "Market Setups",         description: "Discuss catalysts, technical setups, and macro context with source-backed reasoning." },
  { title: "Watchlist Discussions", description: "Compare watchlists and talk through what you are monitoring and why." },
];
