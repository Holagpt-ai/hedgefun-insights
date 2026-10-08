import {
  classifyCatalystPrecedence,
  type CatalystPrecedenceInput,
} from "@/lib/catalyst/precedence";
import {
  scoreCatalystRow,
  selectPrimaryFromScored,
  sortScoredCandidates,
} from "@/lib/ai-analyst/catalyst-selection";
import type { AnalystCatalystRow } from "@/lib/ai-analyst/intelligence-packet-types";
import {
  CURRENT_CATALYST_FORMATTING,
  CURRENT_CATALYST_INSTITUTIONAL_LANGUAGE,
  CURRENT_CATALYST_NO_SPECULATION,
  CURRENT_CATALYST_PERSONALIZATION,
  CURRENT_CATALYST_RESPONSE_SECTIONS,
  CURRENT_CATALYST_VOLUME_LANGUAGE,
} from "@/lib/ai-analyst/catalyst-response-rules";
import type { CatalystStructuredFact } from "@/lib/ai-analyst/catalyst-evidence-facts";
import { CATALYST_VERIFIED_VS_INFERRED_GUIDANCE } from "@/lib/ai-analyst/catalyst-evidence-facts";

export interface RankedCurrentCatalyst {
  title: string;
  eventType: string;
  eventDate: string | null;
  publishedAt: string | null;
  tier: "primary" | "secondary";
  primaryClass: string | null;
  classRank: number;
  evidenceType: string;
  source: string;
  confidence: "verified" | "secondary";
}

export interface CatalystEvidenceItem {
  headline: string;
  eventType: string;
  eventDate: string | null;
  publishedAt: string | null;
  evidenceType: string;
  source: string;
  tier: "primary" | "secondary";
  confidence: "verified" | "secondary";
}

export interface CurrentCatalystAnalysis {
  movementQuestion: true;
  verifiedPrimary: boolean;
  primaryCatalyst: RankedCurrentCatalyst | null;
  secondaryCatalysts: RankedCurrentCatalyst[];
  rankedEvidence: CatalystEvidenceItem[];
  explicitNoVerifiedCatalyst: boolean;
  answerGuidance: string;
  responseSections: string;
  volumeLanguageRule: string;
  institutionalLanguageRule: string;
  personalizationRule: string;
  formattingRule: string;
  retrievalAttempted: boolean;
  catalystEvidenceFacts: CatalystStructuredFact[];
  verifiedVsInferredGuidance: string;
  authoritativeContentFetch?: {
    attempted: boolean;
    urls: string[];
    errors: string[];
  };
}

const SECTOR_WIDE_HEADLINE =
  /\b(?:sector|stocks?|shares?|chip stocks|semiconductors?|ai stocks|tech stocks)\b/i;

function toPrecedenceInput(row: AnalystCatalystRow): CatalystPrecedenceInput {
  const official = row.officialSource === true;
  return {
    title: row.title ?? "",
    event_type: row.eventType,
    provider: official ? "official_company_ir" : "stocksist_catalyst",
    event_date: row.eventDate ?? "",
    published_at: row.publishedAt,
    source_name: row.sourceName ?? null,
    attribution_class: row.attributionClass ?? (official ? "direct" : "direct"),
    ticker_specific: row.tickerSpecific ?? true,
  };
}

function isSectorWideHeadline(title: string, symbol: string): boolean {
  const upper = title.toUpperCase();
  const sym = symbol.toUpperCase();
  if (upper.includes(sym)) return false;
  return SECTOR_WIDE_HEADLINE.test(title);
}

export function rankCurrentCatalysts(
  symbol: string,
  rows: AnalystCatalystRow[],
): RankedCurrentCatalyst[] {
  const ranked = rows
    .map((row) => {
      const input = toPrecedenceInput(row);
      let precedence = classifyCatalystPrecedence(input);
      if (isSectorWideHeadline(row.title ?? "", symbol)) {
        precedence = {
          ...precedence,
          tier: "secondary",
          primaryClass: null,
          classRank: 0,
          isMarketAttention: true,
        };
      }
      return {
        title: row.title ?? "",
        eventType: row.eventType,
        eventDate: row.eventDate,
        publishedAt: row.publishedAt,
        tier: precedence.tier,
        primaryClass: precedence.primaryClass,
        classRank: precedence.classRank,
        isMarketAttention: precedence.isMarketAttention,
        freshness: Date.parse(row.publishedAt ?? row.eventDate ?? "") || 0,
        evidenceType: row.eventType,
        source: row.sourceName ?? "stocksist_catalyst",
        confidence: precedence.tier === "primary" && precedence.classRank > 0 ? "verified" as const : "secondary" as const,
        officialSource: row.officialSource === true,
      };
    })
    .sort((a, b) => {
      const tierA = a.tier === "primary" && !a.isMarketAttention && a.classRank > 0 ? 0 : 1;
      const tierB = b.tier === "primary" && !b.isMarketAttention && b.classRank > 0 ? 0 : 1;
      if (tierA !== tierB) return tierA - tierB;
      if (a.officialSource !== b.officialSource) return (b.officialSource ? 1 : 0) - (a.officialSource ? 1 : 0);
      if (a.classRank !== b.classRank) return b.classRank - a.classRank;
      if (a.freshness !== b.freshness) return b.freshness - a.freshness;
      return (b.eventDate ?? "").localeCompare(a.eventDate ?? "");
    });

  return ranked.map(({ isMarketAttention: _ignore, freshness: _f, officialSource: _o, ...rest }) => rest);
}

function primaryFromScored(symbol: string, rows: AnalystCatalystRow[]): RankedCurrentCatalyst | null {
  const scored = rows.map(scoreCatalystRow);
  const winner = selectPrimaryFromScored(symbol, scored);
  if (!winner) return null;
  return {
    title: winner.row.title ?? "",
    eventType: winner.row.eventType,
    eventDate: winner.row.eventDate,
    publishedAt: winner.row.publishedAt,
    tier: "primary",
    primaryClass: winner.precedence.primaryClass,
    classRank: winner.precedence.classRank,
    evidenceType: winner.row.eventType,
    source: winner.row.sourceName ?? "stocksist_catalyst",
    confidence: "verified",
  };
}

export function buildCurrentCatalystAnalysis(
  symbol: string,
  rows: AnalystCatalystRow[],
): CurrentCatalystAnalysis {
  const scored = rows.map(scoreCatalystRow);
  const ranked = [...scored]
    .sort(sortScoredCandidates)
    .map((s) => ({
      title: s.row.title ?? "",
      eventType: s.row.eventType,
      eventDate: s.row.eventDate,
      publishedAt: s.row.publishedAt,
      tier: s.precedence.tier,
      primaryClass: s.precedence.primaryClass,
      classRank: s.precedence.classRank,
      evidenceType: s.row.eventType,
      source: s.row.sourceName ?? "stocksist_catalyst",
      confidence:
        s.precedence.tier === "primary" && s.precedence.classRank > 0 ? ("verified" as const) : ("secondary" as const),
    }));
  const primary = primaryFromScored(symbol, rows);
  const secondary = ranked.filter((r) => r !== primary && r.title !== primary?.title).slice(0, 4);
  const verifiedPrimary = primary != null;
  const explicitNoVerifiedCatalyst = !verifiedPrimary;

  const rankedEvidence: CatalystEvidenceItem[] = ranked.slice(0, 6).map((r) => ({
    headline: r.title,
    eventType: r.eventType,
    eventDate: r.eventDate,
    publishedAt: r.publishedAt,
    evidenceType: r.evidenceType,
    source: r.source,
    tier: r.tier,
    confidence: r.confidence,
  }));

  const answerGuidance = verifiedPrimary
    ? `Lead with PRIMARY CATALYST: "${primary!.title}". Then KEY DETAILS, WHY MARKET CARES, then SECONDARY CONTEXT. `
      + "Do not lead with sector, AI, or historical analogs when this verified primary catalyst exists. "
      + CURRENT_CATALYST_NO_SPECULATION
    : "State explicitly: No confirmed company-specific catalyst was found in the available fresh sources yet. "
      + "Then you may discuss sector, technical, or macro context as SECONDARY — do not guess a corporate cause. "
      + CURRENT_CATALYST_NO_SPECULATION;

  return {
    movementQuestion: true,
    verifiedPrimary,
    primaryCatalyst: primary,
    secondaryCatalysts: secondary,
    rankedEvidence,
    explicitNoVerifiedCatalyst,
    answerGuidance,
    responseSections: CURRENT_CATALYST_RESPONSE_SECTIONS,
    volumeLanguageRule: CURRENT_CATALYST_VOLUME_LANGUAGE,
    institutionalLanguageRule: CURRENT_CATALYST_INSTITUTIONAL_LANGUAGE,
    personalizationRule: CURRENT_CATALYST_PERSONALIZATION,
    formattingRule: CURRENT_CATALYST_FORMATTING,
    retrievalAttempted: true,
    catalystEvidenceFacts: [],
    verifiedVsInferredGuidance: CATALYST_VERIFIED_VS_INFERRED_GUIDANCE,
  };
}
