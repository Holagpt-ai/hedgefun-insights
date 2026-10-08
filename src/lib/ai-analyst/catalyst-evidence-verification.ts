import { looksLikeMarketAttention } from "@/lib/catalyst/precedence";
import type { CatalystPrecedenceResult } from "@/lib/catalyst/precedence";
import type { AnalystCatalystRow } from "@/lib/ai-analyst/intelligence-packet-types";

const INVESTOR_DAY = /\b(?:investor day|analyst day|capital markets day)\b/i;

/** Concrete company event language. Vague "why the stock is up" copy does not qualify. */
const ESTABLISHED_COMPANY_EVENT =
  /\b(?:investor day|analyst day|capital markets day|8[-\s]?k|earnings\s+(?:beat|miss|results|report|release)|(?:raises?|updates?|cuts?)\s+(?:fy\s*)?guidance|fy\s*20\d{2}|\$\s*\d+(?:\.\d+)?\s*(?:billion|b)\b)\b/i;

const FINANCIAL_MEDIA =
  /motley\s*fool|\bfool\.com\b|seeking\s*alpha|seekingalpha\.com|benzinga|marketwatch|finance\.yahoo|zacks\.com/i;

const EXPLICIT_ANALYST_PRIMARY =
  /\b(?:upgrade[sd]?|downgrade[sd]?|initiat(?:es|ed)|raise[sd]?|lower[sd]?|cut[s]?)\b.{0,40}\b(?:price\s+target|pt|rating|to\s+(?:buy|sell|hold|overweight|underweight|neutral))\b/i;

/** Brave/search path: title + snippet only — no page body fetch. */
export function inferEventTypeFromSearchEvidence(title: string, snippet?: string | null): string {
  const headline = title.trim();
  if (looksLikeMarketAttention(headline)) return "market_attention";
  const text = `${headline} ${snippet ?? ""}`;
  if (/\b8[-\s]?k\b/i.test(text)) return "sec_filing_news";
  if (INVESTOR_DAY.test(text)) return "investor_day";
  if (EXPLICIT_ANALYST_PRIMARY.test(text)) return "analyst_action";
  if (/\bearnings\s+(?:beat|miss|results|report|release)\b/i.test(text)) return "earnings";
  if (/\b(?:raised|lowered|withdrawn|updates?|cuts?)\s+(?:fy\s+)?guidance\b/i.test(text)) return "earnings";
  if (/\bearnings\b/i.test(text)) return "market_attention";
  return "company_news";
}

/** Snippet/title facts only — never infer EPS, margins, or guidance numbers from vague headlines. */
export function extractExplicitMaterialFacts(row: AnalystCatalystRow): string | null {
  if (row.eventType === "market_attention") return null;
  const title = row.title?.trim();
  if (!title) return null;
  if (looksLikeMarketAttention(title)) return null;
  if (/\b(?:eps|margin|revenue\s+surprise|guidance\s+raise)\b/i.test(title) && row.verificationState !== "provider_reported") {
    return null;
  }
  return title;
}

/**
 * Verified primary requires explicit event evidence — not mere search presence or price-move narrative.
 */
export function rowQualifiesAsVerifiedPrimary(
  row: AnalystCatalystRow,
  precedence: CatalystPrecedenceResult,
): boolean {
  if (row.eventType === "market_attention") return false;
  if (precedence.isMarketAttention) return false;

  const title = row.title ?? "";
  if (row.eventType === "analyst_action" && EXPLICIT_ANALYST_PRIMARY.test(title)) {
    if (row.verificationState === "provider_reported") return true;
    if (row.evidenceOrigin === "fresh_web_search" && row.verificationState === "web_search_unverified") {
      return true;
    }
    return false;
  }

  if (precedence.tier !== "primary" || precedence.classRank <= 0) return false;

  const attribution = `${row.sourceName ?? ""} ${row.sourceUrl ?? ""} ${title}`;
  if (
    !row.officialSource
    && FINANCIAL_MEDIA.test(attribution)
    && !ESTABLISHED_COMPANY_EVENT.test(title)
  ) {
    return false;
  }
  if (
    !row.officialSource
    && (row.eventType === "earnings" || row.eventType === "earnings_guidance")
    && !ESTABLISHED_COMPANY_EVENT.test(title)
  ) {
    return false;
  }

  if (row.verificationState === "provider_reported") return true;

  if (row.evidenceOrigin === "stocksist_catalyst" && row.verificationState === "provider_reported") {
    return true;
  }

  if (row.evidenceOrigin === "fresh_web_search" && row.verificationState === "web_search_unverified") {
    return false;
  }

  return false;
}

export function searchEvidenceUsesPageContentFetch(): false {
  return false;
}
