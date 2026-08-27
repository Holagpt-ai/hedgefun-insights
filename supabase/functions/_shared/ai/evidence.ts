/**
 * Typed, validated evidence object for Pre-Market / per-ticker AI generation.
 * Invalid quote fields never enter prompts. Missing RVOL is unavailable, never 0.
 */

import type { AttributionClass } from "../catalyst/attribution.ts";
import { NO_VERIFIED_CATALYST } from "../catalyst/attribution.ts";
import type { NormalizedQuote } from "../quotes/integrity.ts";

export type AiLeanLabel = "Bullish Lean" | "Bearish Lean" | "Mixed" | "Insufficient Data";

export const LEAN_LABELS: Record<string, AiLeanLabel> = {
  bullish: "Bullish Lean",
  bearish: "Bearish Lean",
  neutral: "Mixed",
  data_unavailable: "Insufficient Data",
  mixed: "Mixed",
};

export function leanLabel(direction: string | null | undefined): AiLeanLabel {
  if (!direction) return "Insufficient Data";
  return LEAN_LABELS[direction] ?? "Insufficient Data";
}

export interface EvidenceCatalyst {
  title: string;
  attribution: AttributionClass;
  ticker_specific: boolean;
  source_url: string | null;
  provider: string | null;
  published_at: string | null;
  reason: string;
}

export interface EvidenceEarnings {
  symbol: string;
  event_date: string;
  time_of_day: string | null;
  estimate_eps: number | null;
  actual_eps: number | null;
}

export interface EvidenceSignal {
  signal_id: string;
  label: string;
  direction: "bullish" | "bearish" | "neutral" | null;
}

export interface AiEvidence {
  symbol: string;
  quote_valid: boolean;
  price: number | null;
  change_pct: number | null;
  quote_timestamp: string | null;
  volume: number | null;
  rvol: number | null;
  rvol_available: boolean;
  signals: EvidenceSignal[];
  catalysts: EvidenceCatalyst[];
  earnings: EvidenceEarnings | null;
  missing: string[];
  evidence_cutoff: string;
  no_verified_catalyst: boolean;
}

export const WEAK_SOLO_SIGNAL_IDS: ReadonlySet<string> = new Set([
  "price_below_vwap",
  "price_above_vwap",
]);

export function buildAiEvidence(input: {
  symbol: string;
  quote: NormalizedQuote | null;
  rvol?: number | null;
  rvolAvailable?: boolean;
  signals?: EvidenceSignal[];
  catalysts?: EvidenceCatalyst[];
  earnings?: EvidenceEarnings | null;
  evidenceCutoff: string;
}): AiEvidence {
  const quote = input.quote;
  const quoteValid = !!quote?.valid && quote.price !== null;
  const verified = (input.catalysts ?? []).filter((c) => c.ticker_specific);
  const rvolAvailable = input.rvolAvailable === true && input.rvol !== null && Number.isFinite(input.rvol);
  const missing: string[] = [];
  if (!quoteValid) missing.push("quote");
  if (!rvolAvailable) missing.push("rvol");
  if (verified.length === 0) missing.push("catalyst");
  if (!input.earnings) missing.push("earnings");

  return {
    symbol: input.symbol,
    quote_valid: quoteValid,
    price: quoteValid ? quote!.price : null,
    change_pct: quoteValid ? quote!.change_pct : null,
    quote_timestamp: quoteValid ? quote!.quote_timestamp : null,
    volume: quoteValid ? quote!.volume : null,
    rvol: rvolAvailable ? (input.rvol as number) : null,
    rvol_available: rvolAvailable,
    signals: input.signals ?? [],
    catalysts: verified,
    earnings: input.earnings ?? null,
    missing,
    evidence_cutoff: input.evidenceCutoff,
    no_verified_catalyst: verified.length === 0,
  };
}

export function isInsufficientEvidence(evidence: AiEvidence): boolean {
  if (!evidence.quote_valid) return true;
  const weakSolo =
    evidence.signals.length === 1 && WEAK_SOLO_SIGNAL_IDS.has(evidence.signals[0].signal_id);
  const noCatalyst = evidence.no_verified_catalyst;
  const noEarnings = evidence.earnings === null;
  if (weakSolo && noCatalyst && noEarnings) return true;
  if (evidence.signals.length === 0 && noCatalyst && noEarnings && !evidence.rvol_available) {
    return true;
  }
  return false;
}

/** Prompt-safe JSON. Invalid fields become explicit unavailable markers. */
export function evidenceForPrompt(evidence: AiEvidence): Record<string, unknown> {
  return {
    symbol: evidence.symbol,
    price: evidence.quote_valid ? evidence.price : "unavailable",
    change_pct: evidence.quote_valid && evidence.change_pct !== null ? evidence.change_pct : "unavailable",
    quote_timestamp: evidence.quote_valid && evidence.quote_timestamp ? evidence.quote_timestamp : "unavailable",
    volume: evidence.quote_valid && evidence.volume !== null ? evidence.volume : "unavailable",
    rvol: evidence.rvol_available ? evidence.rvol : "unavailable",
    market_signals: evidence.signals,
    verified_ticker_specific_catalysts: evidence.catalysts,
    confirmed_earnings: evidence.earnings,
    missing: evidence.missing,
    evidence_cutoff: evidence.evidence_cutoff,
    catalyst_disclosure: evidence.no_verified_catalyst ? NO_VERIFIED_CATALYST : null,
  };
}

export const AI_EVIDENCE_RULES = `
EVIDENCE RULES:
- Use ONLY the supplied evidence object. Never invent prices, catalysts, technical signals, or certainty.
- Distinguish observed facts from interpretation.
- If rvol is "unavailable", say so. Never treat missing RVOL as 0 or as neutral.
- You may cite only verified ticker-specific catalysts. If none exist, state exactly: "${NO_VERIFIED_CATALYST}"
- Direction labels must be one of: "Bullish Lean", "Bearish Lean", "Mixed", "Insufficient Data".
- A single VWAP signal (price above/below VWAP) cannot by itself produce a confident directional conclusion.
- If evidence is insufficient, return Insufficient Data.
`.trim();

/** Collapse a generated brief to a concise summary without deleting the original. */
export function summarizeBrief(content: string, maxSentences = 2, maxChars = 320): string {
  const text = stripMarkdownMarkers(content).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = sentences.slice(0, Math.max(1, maxSentences)).join(" ");
  if (out.length > maxChars) {
    out = `${out.slice(0, maxChars).trim()}…`;
  }
  return out;
}

/** Remove raw ATX/emphasis markers so they never render as visible syntax. */
export function stripMarkdownMarkers(content: string): string {
  return content
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export function hasRawMarkdownHeading(content: string): boolean {
  return /(?:^|\n)\s{0,3}#{1,6}\s+\S/.test(content) || /\*\*[A-Z][^*]+\*\*/.test(content);
}
