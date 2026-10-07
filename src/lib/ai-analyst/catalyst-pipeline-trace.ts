import type { AnalystCatalystRow } from "@/lib/ai-analyst/intelligence-packet-types";
import {
  extractExplicitMaterialFacts,
  searchEvidenceUsesPageContentFetch,
} from "@/lib/ai-analyst/catalyst-evidence-verification";

export interface CatalystCandidateTrace {
  headline: string;
  domain: string | null;
  sourceUrl: string | null;
  evidenceOrigin: string;
  officialSource: boolean;
  verificationStatus: string;
  inferredEventType: string;
  extractedFacts: string | null;
  contentFetched: boolean;
  precedenceTier: string;
  primaryClass: string | null;
  classRank: number;
  selectionScore: number;
  demotedReason: string | null;
}

export interface CatalystPipelineTrace {
  symbol: string;
  searchQueries: string[];
  searchHitCount: number;
  internalRowCount: number;
  candidates: CatalystCandidateTrace[];
  selectedPrimaryHeadline: string | null;
  selectedPrimaryClass: string | null;
  selectionStableKey: string | null;
}

export function domainFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export type CatalystCandidateScoreTrace = Pick<
  CatalystCandidateTrace,
  "precedenceTier" | "primaryClass" | "classRank" | "selectionScore" | "demotedReason"
>;

export function buildPipelineTrace(input: {
  symbol: string;
  searchQueries: string[];
  searchHitCount: number;
  internalRowCount: number;
  scored: Array<{
    row: AnalystCatalystRow;
    trace: CatalystCandidateScoreTrace;
  }>;
  primaryTitle: string | null;
  primaryClass: string | null;
}): CatalystPipelineTrace {
  const candidates: CatalystCandidateTrace[] = input.scored.map((s) => ({
    headline: s.row.title ?? "",
    domain: domainFromUrl(s.row.sourceUrl),
    sourceUrl: s.row.sourceUrl ?? null,
    evidenceOrigin: s.row.evidenceOrigin ?? "stocksist_catalyst",
    officialSource: s.row.officialSource === true,
    verificationStatus: s.row.verificationState,
    inferredEventType: s.row.eventType,
    extractedFacts: extractExplicitMaterialFacts(s.row),
    contentFetched: searchEvidenceUsesPageContentFetch(),
    precedenceTier: s.trace.precedenceTier,
    primaryClass: s.trace.primaryClass,
    classRank: s.trace.classRank,
    selectionScore: s.trace.selectionScore,
    demotedReason: s.trace.demotedReason,
  }));

  const selectionStableKey = input.primaryTitle
    ? `${input.primaryClass ?? "none"}|${input.primaryTitle.toLowerCase()}`
    : null;

  return {
    symbol: input.symbol,
    searchQueries: input.searchQueries,
    searchHitCount: input.searchHitCount,
    internalRowCount: input.internalRowCount,
    candidates,
    selectedPrimaryHeadline: input.primaryTitle,
    selectedPrimaryClass: input.primaryClass,
    selectionStableKey,
  };
}
