import {
  classifyCatalystPrecedence,
  type CatalystPrecedenceInput,
} from "@/lib/catalyst/precedence";
import type { AnalystCatalystRow } from "@/lib/ai-analyst/intelligence-packet-types";

export interface RankedCurrentCatalyst {
  title: string;
  eventType: string;
  eventDate: string | null;
  publishedAt: string | null;
  tier: "primary" | "secondary";
  primaryClass: string | null;
  classRank: number;
}

export interface CurrentCatalystAnalysis {
  movementQuestion: true;
  verifiedPrimary: boolean;
  primaryCatalyst: RankedCurrentCatalyst | null;
  secondaryCatalysts: RankedCurrentCatalyst[];
  explicitNoVerifiedCatalyst: boolean;
  answerGuidance: string;
}

function toPrecedenceInput(row: AnalystCatalystRow): CatalystPrecedenceInput {
  return {
    title: row.title ?? "",
    event_type: row.eventType,
    provider: "stocksist_catalyst",
    event_date: row.eventDate ?? "",
    published_at: row.publishedAt,
    attribution_class: "direct",
    ticker_specific: true,
  };
}

export function rankCurrentCatalysts(
  symbol: string,
  rows: AnalystCatalystRow[],
): RankedCurrentCatalyst[] {
  const ranked = rows
    .map((row) => {
      const input = toPrecedenceInput(row);
      const precedence = classifyCatalystPrecedence(input);
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
      };
    })
    .sort((a, b) => {
      const tierA = a.tier === "primary" && !a.isMarketAttention ? 0 : 1;
      const tierB = b.tier === "primary" && !b.isMarketAttention ? 0 : 1;
      if (tierA !== tierB) return tierA - tierB;
      if (a.classRank !== b.classRank) return b.classRank - a.classRank;
      if (a.freshness !== b.freshness) return b.freshness - a.freshness;
      return (b.eventDate ?? "").localeCompare(a.eventDate ?? "");
    });

  return ranked.map(({ isMarketAttention: _ignore, freshness: _f, ...rest }) => rest);
}

export function buildCurrentCatalystAnalysis(
  symbol: string,
  rows: AnalystCatalystRow[],
): CurrentCatalystAnalysis {
  const ranked = rankCurrentCatalysts(symbol, rows);
  const primary = ranked.find((r) => r.tier === "primary" && r.classRank > 0) ?? null;
  const secondary = ranked.filter((r) => r !== primary).slice(0, 3);
  const verifiedPrimary = primary != null;
  const explicitNoVerifiedCatalyst = !verifiedPrimary;

  const answerGuidance = verifiedPrimary
    ? "Lead with PRIMARY CATALYST (verified event), then WHY MARKET CARES, then SECONDARY CONTEXT. "
      + "Do not lead with sector, AI, or historical analogs when a verified primary catalyst exists."
    : "State explicitly: No verified company-specific catalyst found. "
      + "Then you may discuss sector, technical, or historical context without guessing a corporate cause.";

  return {
    movementQuestion: true,
    verifiedPrimary,
    primaryCatalyst: primary,
    secondaryCatalysts: secondary,
    explicitNoVerifiedCatalyst,
    answerGuidance,
  };
}
