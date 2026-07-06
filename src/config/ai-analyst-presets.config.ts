// Workflow-grouped quick prompts for the AI Analyst empty state.
// Each prompt is dispatched through the existing sendMessage flow —
// no backend/model/tier logic lives here.

export interface AnalystPreset {
  label: string;
  prompt: string;
}

export interface AnalystPresetGroup {
  id: string;
  title: string;
  presets: AnalystPreset[];
}

export const ANALYST_PRESET_GROUPS: AnalystPresetGroup[] = [
  {
    id: "market-prep",
    title: "Market Prep",
    presets: [
      { label: "Build my AM trading plan", prompt: "Build my AM trading plan for today using pre-market gappers, key catalysts, and risk to watch." },
      { label: "What should I watch at the open?", prompt: "What should I watch at the open today? Focus on levels, volume, and setup quality." },
      { label: "Today's gappers & risk", prompt: "Summarize today's top gappers and the risk around them — dilution, news quality, and float." },
    ],
  },
  {
    id: "screeners",
    title: "Screeners",
    presets: [
      { label: "Strongest screener names", prompt: "Explain the strongest screener names right now and why they stand out." },
      { label: "Most actionable tickers", prompt: "Which screener tickers look most actionable today for a swing or day trade?" },
      { label: "High-RVOL names", prompt: "Find high-RVOL names worth watching and explain what's driving the volume." },
    ],
  },
  {
    id: "watchlist",
    title: "Watchlist",
    presets: [
      { label: "Scan my watchlist for setups", prompt: "Scan my watchlist for setups worth trading today and rank them by quality." },
      { label: "Strongest catalysts", prompt: "Which watchlist names have the strongest catalysts this week?" },
      { label: "What to avoid today", prompt: "Which of my watchlist names should I avoid or remove today, and why?" },
    ],
  },
  {
    id: "catalyst",
    title: "Catalyst",
    presets: [
      { label: "Today's biggest catalysts", prompt: "Summarize today's biggest catalysts and which tickers they affect." },
      { label: "Catalysts this week", prompt: "Which catalysts could move stocks this week — earnings, FDA, macro, or index flows?" },
      { label: "FDA / earnings / index risk", prompt: "Explain FDA, earnings, and index-flow risk for names on my radar right now." },
    ],
  },
  {
    id: "action-center",
    title: "Action Center",
    presets: [
      { label: "Turn data into a priority list", prompt: "Turn today's dashboard data into a prioritized action list for me." },
      { label: "My top 3 actions right now", prompt: "What are my top 3 actions right now based on the market and my watchlist?" },
      { label: "Trading checklist for today", prompt: "Build a trading checklist for today covering prep, execution, and risk." },
    ],
  },
  {
    id: "post-market",
    title: "Post-Market",
    presets: [
      { label: "Summarize today's tape", prompt: "Summarize today's tape — breadth, leaders, laggards, and sector rotation." },
      { label: "Prepare for tomorrow", prompt: "What should I prepare for tomorrow based on today's close and after-hours moves?" },
      { label: "Review today's watchlist & risk", prompt: "Review today's watchlist and the risk I took on — what worked, what didn't?" },
    ],
  },
  {
    id: "journal-education",
    title: "Journal / Education",
    presets: [
      { label: "Review my recent trades", prompt: "Review my recent trades and highlight patterns in my performance." },
      { label: "Mistake patterns to watch", prompt: "What mistake patterns should I watch for based on my recent trading?" },
      { label: "Coach me on this setup", prompt: "Explain this setup like a trading coach — entry, confirmation, stop, and target." },
    ],
  },
];

export const ANALYST_CONTEXT_CHIPS: string[] = [
  "Dashboard context",
  "Watchlist symbols",
  "Screener data",
  "Earnings calendar",
  "Journal context",
  "Delayed market data",
];
