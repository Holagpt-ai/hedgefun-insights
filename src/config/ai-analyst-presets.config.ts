// Trading-intent workflow configuration for the AI Analyst command center.
//
// These are editable prompt templates only. Selecting a workflow never submits
// an analysis, and nothing here changes backend, model, or entitlement logic.
//
// Every prompt is written to stay inside what the analysis path can actually
// see: the Stocksist context attached to the request. No preset may ask for
// live news, filings, open positions, or external web research.

export type AnalystWorkflowId =
  | "quick-scan"
  | "trade-thesis"
  | "catalyst-review"
  | "risk-check"
  | "journal-review"
  | "deep-research";

export type AnalystWorkflowIcon =
  | "zap"
  | "scale"
  | "calendar"
  | "shield"
  | "book"
  | "microscope";

export interface AnalystWorkflow {
  id: AnalystWorkflowId;
  /** Short control label. */
  name: string;
  /** Compact "best for" description shown under the name. */
  bestFor: string;
  icon: AnalystWorkflowIcon;
  /** Builds an editable draft. `symbol` is already normalized, or null. */
  buildPrompt: (symbol: string | null) => string;
}

/** Shared honesty clause so no workflow implies unavailable data sources. */
const ONLY_AVAILABLE = "Use only the Stocksist context available in this request and say plainly when something isn't available.";

const subject = (symbol: string | null) => (symbol ? symbol : "the current market setup");

export const ANALYST_WORKFLOWS: AnalystWorkflow[] = [
  {
    id: "quick-scan",
    name: "Quick Scan",
    bestFor: "Fast read on what stands out",
    icon: "zap",
    buildPrompt: (symbol) =>
      `Give me a rapid synthesis of ${subject(symbol)}: what stands out, what is unclear, and what I should confirm myself before acting. ${ONLY_AVAILABLE}`,
  },
  {
    id: "trade-thesis",
    name: "Trade Thesis",
    bestFor: "Bull case, bear case, invalidation",
    icon: "scale",
    buildPrompt: (symbol) =>
      `Build a balanced trade thesis for ${subject(symbol)}: the bull case, the bear case, what would invalidate the idea, and any relevant levels the context supports. ${ONLY_AVAILABLE}`,
  },
  {
    id: "catalyst-review",
    name: "Catalyst Review",
    bestFor: "Event impact, timing, missing evidence",
    icon: "calendar",
    buildPrompt: (symbol) =>
      `Review the verified catalyst context for ${subject(symbol)}: what the event is, its likely impact, its timing, and which evidence is missing. ${ONLY_AVAILABLE}`,
  },
  {
    id: "risk-check",
    name: "Risk Check",
    bestFor: "Downside, liquidity, volatility, events",
    icon: "shield",
    buildPrompt: (symbol) =>
      `Pressure-test the risk in ${subject(symbol)}: downside, liquidity, volatility, event risk, and the conditions that would invalidate the setup. ${ONLY_AVAILABLE}`,
  },
  {
    id: "journal-review",
    name: "Journal Review",
    bestFor: "Patterns in the trades provided",
    icon: "book",
    buildPrompt: (symbol) =>
      symbol
        ? `Review any trade or journal context provided for ${symbol} and highlight patterns worth acting on. Do not assume trades that were not included. ${ONLY_AVAILABLE}`
        : `Review any trade or journal context provided and highlight patterns worth acting on. Do not assume trades that were not included. ${ONLY_AVAILABLE}`,
  },
  {
    id: "deep-research",
    name: "Deep Research",
    bestFor: "Highest-detail supported review",
    icon: "microscope",
    buildPrompt: (symbol) =>
      `Work through ${subject(symbol)} in the highest detail this analysis path supports: setup quality, competing interpretations, risk, and what would change the conclusion. Flag every assumption and every gap. ${ONLY_AVAILABLE}`,
  },
];

export const DEFAULT_ANALYST_WORKFLOW_ID: AnalystWorkflowId = "quick-scan";

export function getAnalystWorkflow(id: AnalystWorkflowId): AnalystWorkflow {
  return ANALYST_WORKFLOWS.find((w) => w.id === id) ?? ANALYST_WORKFLOWS[0];
}

/**
 * Outcome-oriented depth presentation.
 *
 * `value` and `minPlan` are the existing backend tier identifiers and access
 * rules — unchanged. Only the user-facing wording is outcome-oriented, and no
 * provider or model name is exposed.
 */
export interface AnalysisDepthOption {
  label: string;
  description: string;
  value: "fast" | "standard" | "deep";
  minPlan: "free" | "pro" | "unlimited";
}

export const ANALYSIS_DEPTH_OPTIONS: AnalysisDepthOption[] = [
  { label: "Quick", description: "Rapid synthesis", value: "fast", minPlan: "free" },
  { label: "Standard", description: "Balanced trading analysis", value: "standard", minPlan: "pro" },
  { label: "Deep", description: "Highest-detail supported reasoning", value: "deep", minPlan: "unlimited" },
];

/** Access-tier display names, keyed by the normalized plan string. */
export const ACCESS_TIER_LABELS: Record<string, string> = {
  free: "Free",
  pro: "Pro",
  unlimited: "Unlimited",
  admin: "Admin",
};
