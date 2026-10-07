/**
 * Deno mirror of src/lib/ai-analyst/catalyst-selection.ts — keep in sync.
 */

import {
  classifyCatalystPrecedence,
  looksLikeMarketAttention,
  PRIMARY_CLASS_RANK,
  type CatalystPrecedenceResult,
} from "../catalyst/precedence.ts";
import { rowQualifiesAsVerifiedPrimary } from "./catalyst-evidence-verification.ts";

export type CatalystRow = {
  eventType: string;
  eventDate: string | null;
  title: string | null;
  publishedAt: string | null;
  verificationState: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  officialSource?: boolean;
  evidenceOrigin?: "stocksist_catalyst" | "fresh_web_search";
  attributionClass?: "direct" | "provider_associated" | "sector_related" | "unverified";
  tickerSpecific?: boolean;
};

const INVESTOR_DAY = /\b(?:investor day|analyst day|capital markets day)\b/i;

function toPrecedenceInput(row: CatalystRow) {
  const official = row.officialSource === true;
  return {
    title: row.title ?? "",
    event_type: row.eventType,
    provider: official ? "official_company_ir" : "stocksist_catalyst",
    event_date: row.eventDate ?? "",
    published_at: row.publishedAt,
    source_name: row.sourceName ?? null,
    attribution_class: row.attributionClass ?? "direct",
    ticker_specific: row.tickerSpecific ?? true,
  };
}

function applyEvidenceAdjustments(row: CatalystRow, precedence: CatalystPrecedenceResult): CatalystPrecedenceResult {
  const title = row.title ?? "";
  if (INVESTOR_DAY.test(title) && row.officialSource) {
    return {
      tier: "primary",
      primaryClass: "investor_day",
      classRank: PRIMARY_CLASS_RANK.investor_day,
      isMarketAttention: false,
    };
  }
  if (looksLikeMarketAttention(title, row.eventType)) {
    return { tier: "secondary", primaryClass: null, classRank: 0, isMarketAttention: true };
  }
  if (row.evidenceOrigin === "fresh_web_search" && row.verificationState !== "provider_reported") {
    const cappedRank = precedence.classRank > 0 ? Math.min(precedence.classRank, 45) : precedence.classRank;
    return { ...precedence, classRank: cappedRank };
  }
  return precedence;
}

export function scoreCatalystRow(row: CatalystRow) {
  let precedence = classifyCatalystPrecedence(toPrecedenceInput(row));
  precedence = applyEvidenceAdjustments(row, precedence);
  let demotedReason: string | null = null;
  if (precedence.isMarketAttention) demotedReason = "market_attention_headline";
  else if (precedence.tier !== "primary" || precedence.classRank <= 0) demotedReason = "not_primary_class";
  let selectionScore = precedence.classRank;
  if (row.officialSource) selectionScore += 1000;
  if (row.evidenceOrigin === "stocksist_catalyst") selectionScore += 500;
  const explicitAnalyst =
    row.eventType === "analyst_action"
    && /\b(?:upgrade|downgrade|price target)\b/i.test(row.title ?? "");
  if ((precedence.isMarketAttention || precedence.tier === "secondary") && !explicitAnalyst) {
    selectionScore -= 2000;
  }
  if (explicitAnalyst && (row.verificationState === "provider_reported" || row.evidenceOrigin === "fresh_web_search")) {
    selectionScore = Math.max(selectionScore, 60);
  }
  return { row, precedence, selectionScore, demotedReason };
}

export function sortScoredCandidates(
  a: ReturnType<typeof scoreCatalystRow>,
  b: ReturnType<typeof scoreCatalystRow>,
): number {
  if (a.selectionScore !== b.selectionScore) return b.selectionScore - a.selectionScore;
  const titleA = (a.row.title ?? "").toLowerCase();
  const titleB = (b.row.title ?? "").toLowerCase();
  if (titleA !== titleB) return titleA.localeCompare(titleB);
  return (a.row.sourceUrl ?? "").localeCompare(b.row.sourceUrl ?? "");
}

export function selectPrimaryFromScored(_symbol: string, scored: ReturnType<typeof scoreCatalystRow>[]) {
  const sorted = [...scored].sort(sortScoredCandidates);
  return sorted.find((s) => {
    if (!rowQualifiesAsVerifiedPrimary(s.row, s.precedence)) return false;
    if (s.row.eventType === "analyst_action") return true;
    return s.selectionScore > 0 && s.precedence.classRank > 0;
  }) ?? null;
}

export function deterministicSortSearchRows<T extends { sourceUrl?: string | null; title?: string | null }>(
  rows: readonly T[],
): T[] {
  return [...rows].sort((a, b) => {
    const url = (a.sourceUrl ?? "").localeCompare(b.sourceUrl ?? "");
    if (url !== 0) return url;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
}

export function mergeRowsDeterministic(internal: CatalystRow[], fromSearch: CatalystRow[]): CatalystRow[] {
  const orderedSearch = deterministicSortSearchRows(fromSearch);
  const seen = new Set<string>();
  const merged: CatalystRow[] = [];
  for (const row of [...internal, ...orderedSearch]) {
    const key = `${row.sourceUrl ?? ""}|${row.title ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged.slice(0, 12);
}

export function buildSelectionTrace(input: {
  symbol: string;
  searchQueries: string[];
  searchHitCount: number;
  internalRowCount: number;
  rows: CatalystRow[];
}) {
  const scored = input.rows.map(scoreCatalystRow);
  const primary = selectPrimaryFromScored(input.symbol, scored);
  return {
    symbol: input.symbol,
    searchQueries: input.searchQueries,
    searchHitCount: input.searchHitCount,
    internalRowCount: input.internalRowCount,
    selectedPrimaryHeadline: primary?.row.title ?? null,
    selectedPrimaryClass: primary?.precedence.primaryClass ?? null,
    candidates: scored.map((s) => ({
      headline: s.row.title,
      domain: s.row.sourceUrl ? new URL(s.row.sourceUrl).hostname : null,
      sourceUrl: s.row.sourceUrl ?? null,
      evidenceOrigin: s.row.evidenceOrigin ?? "stocksist_catalyst",
      officialSource: s.row.officialSource === true,
      verificationStatus: s.row.verificationState,
      inferredEventType: s.row.eventType,
      contentFetched: false,
      precedenceTier: s.precedence.tier,
      primaryClass: s.precedence.primaryClass,
      classRank: s.precedence.classRank,
      selectionScore: s.selectionScore,
      demotedReason: s.demotedReason,
    })),
  };
}
