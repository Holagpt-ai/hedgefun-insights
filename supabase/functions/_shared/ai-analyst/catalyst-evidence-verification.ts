/** Deno mirror of src/lib/ai-analyst/catalyst-evidence-verification.ts */

import { looksLikeMarketAttention, type CatalystPrecedenceResult } from "../catalyst/precedence.ts";

type CatalystRow = {
  eventType: string;
  title: string | null;
  verificationState: string;
  evidenceOrigin?: "stocksist_catalyst" | "fresh_web_search";
};

const INVESTOR_DAY = /\b(?:investor day|analyst day|capital markets day)\b/i;

const EXPLICIT_ANALYST_PRIMARY =
  /\b(?:upgrade[sd]?|downgrade[sd]?|initiat(?:es|ed)|raise[sd]?|lower[sd]?|cut[s]?)\b.{0,40}\b(?:price\s+target|pt|rating|to\s+(?:buy|sell|hold|overweight|underweight|neutral))\b/i;

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

export function rowQualifiesAsVerifiedPrimary(
  row: CatalystRow,
  precedence: CatalystPrecedenceResult,
): boolean {
  if (row.eventType === "market_attention") return false;
  if (precedence.isMarketAttention) return false;
  const title = row.title ?? "";
  if (row.eventType === "analyst_action" && EXPLICIT_ANALYST_PRIMARY.test(title)) {
    if (row.verificationState === "provider_reported") return true;
    if (row.evidenceOrigin === "fresh_web_search" && row.verificationState === "web_search_unverified") return true;
    return false;
  }
  if (precedence.tier !== "primary" || precedence.classRank <= 0) return false;
  if (row.verificationState === "provider_reported") return true;
  if (row.evidenceOrigin === "stocksist_catalyst" && row.verificationState === "provider_reported") return true;
  if (row.evidenceOrigin === "fresh_web_search" && row.verificationState === "web_search_unverified") return false;
  return false;
}
