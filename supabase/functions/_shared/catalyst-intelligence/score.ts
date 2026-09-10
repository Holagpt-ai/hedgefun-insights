// Deterministic 0–100 scoring. Fail closed on missing/unknown inputs.
// Commentary and unknown providers cannot become high-priority via
// ticker-specificity alone.

import type {
  CatalystClassification,
  NormalizedCatalystInput,
  ScoreBreakdown,
} from "./types.ts";
import type { ClassificationResult } from "./classify.ts";
import { providerPolicy } from "./providers.ts";

export const COMMENTARY_SCORE_CAP = 35;
export const UNKNOWN_PROVIDER_SCORE_CAP = 40;
export const NON_SPECIFIC_SCORE_CAP = 50;
export const ORDINARY_CONTEXT_SCORE_CAP = 55;
export const HIGH_PRIORITY_THRESHOLD = 65;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function sourceQualityScore(provider: string): number {
  return clampScore(providerPolicy(provider).sourceQuality);
}

export function tickerSpecificityScore(
  classified: ClassificationResult,
  input: NormalizedCatalystInput,
): number {
  if (input.provider === "sec_edgar" || input.provider === "earnings_calendar") {
    return 90;
  }
  if (classified.attribution_class === "direct" && classified.ticker_specific) return 90;
  if (classified.attribution_class === "provider_associated" && classified.ticker_specific) {
    return 55;
  }
  if (classified.attribution_class === "sector_related") return 20;
  if (classified.ticker_specific) return 50;
  return 10;
}

export function materialityScore(classification: CatalystClassification, eventType: string): number {
  let base = 35;
  if (classification === "hard") base = 85;
  else if (classification === "emerging") base = 60;
  else if (classification === "context") base = 35;
  else base = 15;

  if (classification !== "commentary") {
    if (eventType === "fda_biotech" || eventType === "merger_acquisition") base += 5;
    if (eventType === "sec_filing_news" && classification === "hard") base += 3;
  }
  return clampScore(base);
}

export function freshnessScore(input: NormalizedCatalystInput, nowMs: number): number {
  if (!Number.isFinite(nowMs)) return 20;
  const scheduled = input.provider === "earnings_calendar" && input.event_type === "earnings";
  const iso = input.published_at ?? input.event_time ?? null;
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) {
      const age = nowMs - t;
      if (age < 0 && age > -7 * DAY) return scheduled ? 85 : 70;
      if (age < 6 * HOUR) return 95;
      if (age < 24 * HOUR) return 80;
      if (age < 72 * HOUR) return 55;
      if (age < 7 * DAY) return 30;
      return 10;
    }
  }
  if (input.event_date && /^\d{4}-\d{2}-\d{2}$/.test(input.event_date)) {
    const dayMs = Date.parse(`${input.event_date}T12:00:00Z`);
    if (Number.isFinite(dayMs)) {
      const age = nowMs - dayMs;
      if (scheduled && age < 2 * DAY && age > -30 * DAY) return 85;
      if (age < 24 * HOUR && age > -24 * HOUR) return 70;
      if (age < 7 * DAY) return 30;
    }
  }
  return 20;
}

export function confidenceScore(
  sourceQuality: number,
  tickerSpecificity: number,
  classification: CatalystClassification,
  provider: string,
): number {
  let conf = 0.55 * sourceQuality + 0.45 * tickerSpecificity;
  if (classification === "commentary") conf *= 0.6;
  const cap = providerPolicy(provider).confidenceCap;
  if (cap !== null) conf = Math.min(conf, cap);
  return clampScore(conf);
}

export function rawCatalystScore(parts: {
  materiality: number;
  source_quality: number;
  ticker_specificity: number;
  freshness: number;
  confidence: number;
}): number {
  return clampScore(
    0.30 * parts.materiality +
      0.25 * parts.ticker_specificity +
      0.20 * parts.source_quality +
      0.15 * parts.freshness +
      0.10 * parts.confidence,
  );
}

export interface DowngradeApplied {
  score: number;
  reasons: string[];
}

/**
 * Deterministic caps. Ticker specificity cannot lift commentary or
 * unknown-provider rows into high-priority territory.
 */
export function applyScoreDowngrades(
  raw: number,
  classification: CatalystClassification,
  provider: string,
  tickerSpecific: boolean,
  contextActionability?: "ordinary" | "material" | null,
): DowngradeApplied {
  const reasons: string[] = [];
  let score = clampScore(raw);
  if (classification === "commentary") {
    if (score > COMMENTARY_SCORE_CAP) {
      score = COMMENTARY_SCORE_CAP;
      reasons.push("commentary_score_cap");
    }
  }
  if (classification === "context" && contextActionability === "ordinary") {
    if (score > ORDINARY_CONTEXT_SCORE_CAP) {
      score = ORDINARY_CONTEXT_SCORE_CAP;
      reasons.push("ordinary_context_score_cap");
    }
  }
  const policy = providerPolicy(provider);
  if (!policy.known && policy.scoreCap !== null && score > policy.scoreCap) {
    score = policy.scoreCap;
    reasons.push("unknown_provider_score_cap");
  }
  if (!tickerSpecific && classification !== "commentary" && score > NON_SPECIFIC_SCORE_CAP) {
    score = NON_SPECIFIC_SCORE_CAP;
    reasons.push("non_specific_score_cap");
  }
  return { score, reasons };
}

export function scoreIntelligence(
  input: NormalizedCatalystInput,
  classified: ClassificationResult,
  nowMs: number,
): ScoreBreakdown {
  const source_quality = sourceQualityScore(input.provider);
  const ticker_specificity = tickerSpecificityScore(classified, input);
  const materiality = materialityScore(classified.classification, input.event_type);
  const freshness = freshnessScore(input, nowMs);
  const confidence = confidenceScore(
    source_quality,
    ticker_specificity,
    classified.classification,
    input.provider,
  );
  const raw = rawCatalystScore({
    materiality,
    source_quality,
    ticker_specificity,
    freshness,
    confidence,
  });
  const downgraded = applyScoreDowngrades(
    raw,
    classified.classification,
    input.provider,
    classified.ticker_specific,
    classified.context_actionability,
  );
  return {
    source_quality,
    ticker_specificity,
    materiality,
    freshness,
    confidence,
    catalyst_score: downgraded.score,
  };
}
