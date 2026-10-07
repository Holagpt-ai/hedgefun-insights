import {
  classifyCatalystPrecedence,
  looksLikeMarketAttention,
  PRIMARY_CLASS_RANK,
  type CatalystPrecedenceResult,
} from "@/lib/catalyst/precedence";
import { rowQualifiesAsVerifiedPrimary } from "@/lib/ai-analyst/catalyst-evidence-verification";
import type { AnalystCatalystRow } from "@/lib/ai-analyst/intelligence-packet-types";
import { buildPipelineTrace, type CatalystPipelineTrace } from "@/lib/ai-analyst/catalyst-pipeline-trace";
import type { CurrentCatalystAnalysis } from "@/lib/ai-analyst/current-catalyst";
import type { AnalystCatalystRowWithProvenance } from "@/lib/ai-analyst/catalyst-search-types";

const INVESTOR_DAY = /\b(?:investor day|analyst day|capital markets day)\b/i;

export interface ScoredCatalystRow {
  row: AnalystCatalystRow;
  precedence: CatalystPrecedenceResult;
  selectionScore: number;
  demotedReason: string | null;
}

function toPrecedenceInput(row: AnalystCatalystRow) {
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

function applyEvidenceAdjustments(
  row: AnalystCatalystRow,
  precedence: CatalystPrecedenceResult,
): CatalystPrecedenceResult {
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
    return {
      tier: "secondary",
      primaryClass: null,
      classRank: 0,
      isMarketAttention: true,
    };
  }
  if (row.evidenceOrigin === "fresh_web_search" && row.verificationState !== "provider_reported") {
    const cappedRank = precedence.classRank > 0 ? Math.min(precedence.classRank, 45) : precedence.classRank;
    return { ...precedence, classRank: cappedRank };
  }
  return precedence;
}

export function scoreCatalystRow(row: AnalystCatalystRow): ScoredCatalystRow {
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

/** Stable ordering — independent of search/API result order. */
export function sortScoredCandidates(a: ScoredCatalystRow, b: ScoredCatalystRow): number {
  if (a.selectionScore !== b.selectionScore) return b.selectionScore - a.selectionScore;
  const titleA = (a.row.title ?? "").toLowerCase();
  const titleB = (b.row.title ?? "").toLowerCase();
  if (titleA !== titleB) return titleA.localeCompare(titleB);
  return (a.row.sourceUrl ?? "").localeCompare(b.row.sourceUrl ?? "");
}

export function selectPrimaryFromScored(symbol: string, scored: ScoredCatalystRow[]): ScoredCatalystRow | null {
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

export function runDeterministicCatalystSelection(input: {
  symbol: string;
  rows: AnalystCatalystRow[];
  searchQueries?: string[];
  searchHitCount?: number;
  internalRowCount?: number;
  buildAnalysis: (symbol: string, rows: AnalystCatalystRow[]) => CurrentCatalystAnalysis;
}): {
  analysis: CurrentCatalystAnalysis;
  trace: CatalystPipelineTrace;
  mergedRows: AnalystCatalystRow[];
} {
  const scored = input.rows.map(scoreCatalystRow);
  const analysis = input.buildAnalysis(input.symbol, input.rows);

  const trace = buildPipelineTrace({
    symbol: input.symbol,
    searchQueries: input.searchQueries ?? [],
    searchHitCount: input.searchHitCount ?? 0,
    internalRowCount: input.internalRowCount ?? 0,
    scored: scored.map((s) => ({
      row: s.row,
      trace: {
        precedenceTier: s.precedence.tier,
        primaryClass: s.precedence.primaryClass,
        classRank: s.precedence.classRank,
        selectionScore: s.selectionScore,
        demotedReason: s.demotedReason,
      },
    })),
    primaryTitle: analysis.primaryCatalyst?.title ?? null,
    primaryClass: analysis.primaryCatalyst?.primaryClass ?? null,
  });

  return { analysis, trace, mergedRows: input.rows };
}

export function mergeAndSelectCatalystEvidence(input: {
  symbol: string;
  internal: readonly AnalystCatalystRowWithProvenance[];
  fromSearch: readonly AnalystCatalystRowWithProvenance[];
  searchQueries?: string[];
  buildAnalysis: (symbol: string, rows: AnalystCatalystRow[]) => CurrentCatalystAnalysis;
}): ReturnType<typeof runDeterministicCatalystSelection> {
  const orderedSearch = deterministicSortSearchRows(input.fromSearch);
  const seen = new Set<string>();
  const merged: AnalystCatalystRowWithProvenance[] = [];
  for (const row of [...input.internal, ...orderedSearch]) {
    const key = `${row.sourceUrl ?? ""}|${row.title ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return runDeterministicCatalystSelection({
    symbol: input.symbol,
    rows: merged.slice(0, 12),
    searchQueries: input.searchQueries,
    searchHitCount: input.fromSearch.length,
    internalRowCount: input.internal.length,
    buildAnalysis: input.buildAnalysis,
  });
}
