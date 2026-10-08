/** Deno mirror of src/lib/ai-analyst/catalyst-authoritative-enrich.ts */

import type { CatalystRow } from "./catalyst-selection.ts";
import {
  extractOfficialSameHostLinks,
  extractStructuredFactsFromPlainText,
  htmlToPlainText,
  isTrustedAttributedSecondaryUrl,
  type CatalystEvidenceVerificationLevel,
  type CatalystStructuredFact,
} from "./catalyst-evidence-facts.ts";

export type AuthoritativeHtmlFetch = (url: string) => Promise<string | null>;

export interface AuthoritativeEnrichmentResult {
  facts: CatalystStructuredFact[];
  contentFetchedUrls: string[];
  fetchErrors: string[];
}

export const AUTHORITATIVE_ENRICH_MAX_FETCHES = 2;
export const AUTHORITATIVE_ENRICH_MAX_BYTES = 512_000;

function verificationForUrl(url: string): CatalystEvidenceVerificationLevel {
  try {
    if (new URL(url).pathname.toLowerCase().endsWith(".pdf")) return "official_document";
  } catch {
    /* ignore */
  }
  if (isTrustedAttributedSecondaryUrl(url)) return "attributed_secondary";
  return "official_page";
}

export async function enrichAuthoritativeCatalystFacts(input: {
  primaryRow: CatalystRow | null;
  supportingRows: readonly CatalystRow[];
  fetchHtml: AuthoritativeHtmlFetch;
  maxFetches?: number;
}): Promise<AuthoritativeEnrichmentResult> {
  const maxFetches = input.maxFetches ?? AUTHORITATIVE_ENRICH_MAX_FETCHES;
  const contentFetchedUrls: string[] = [];
  const fetchErrors: string[] = [];
  const facts: CatalystStructuredFact[] = [];

  if (!input.primaryRow?.sourceUrl) {
    return { facts, contentFetchedUrls, fetchErrors };
  }

  const primaryUrl = input.primaryRow.sourceUrl;
  if (!input.primaryRow.officialSource && !isTrustedAttributedSecondaryUrl(primaryUrl)) {
    return { facts, contentFetchedUrls, fetchErrors };
  }

  const queue: string[] = [primaryUrl];
  while (queue.length > 0 && contentFetchedUrls.length < maxFetches) {
    const url = queue.shift()!;
    if (contentFetchedUrls.includes(url)) continue;
    let html: string | null = null;
    try {
      html = await input.fetchHtml(url);
    } catch (err) {
      fetchErrors.push(`${url}: ${err instanceof Error ? err.message : "fetch_failed"}`);
      continue;
    }
    if (!html) {
      fetchErrors.push(`${url}: empty_body`);
      continue;
    }
    if (html.length > AUTHORITATIVE_ENRICH_MAX_BYTES) {
      fetchErrors.push(`${url}: body_too_large`);
      continue;
    }
    contentFetchedUrls.push(url);
    const level = verificationForUrl(url);
    const plain = html.includes("<") ? htmlToPlainText(html) : html;
    facts.push(...extractStructuredFactsFromPlainText(plain, url, level));
    if (url === primaryUrl && input.primaryRow.officialSource && contentFetchedUrls.length < maxFetches) {
      for (const link of extractOfficialSameHostLinks(html, url, 2)) {
        if (!queue.includes(link)) queue.push(link);
      }
    }
  }

  return { facts: dedupeByKey(facts), contentFetchedUrls, fetchErrors };
}

function dedupeByKey(facts: CatalystStructuredFact[]): CatalystStructuredFact[] {
  const seen = new Set<string>();
  const out: CatalystStructuredFact[] = [];
  for (const f of facts) {
    const key = `${f.category}|${f.fiscalYear}|${f.amountLabel}|${f.sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function attachEvidenceFactsToAnalysis(
  analysis: Record<string, unknown>,
  enrichment: AuthoritativeEnrichmentResult,
): Record<string, unknown> {
  const catalystEvidenceFacts = enrichment.facts;
  const priorGuidance = typeof analysis.answerGuidance === "string" ? analysis.answerGuidance : "";
  const factHint =
    catalystEvidenceFacts.length > 0
      ? ` Verified event facts (${catalystEvidenceFacts.length}) are in catalystEvidenceFacts — cite them in KEY DETAILS with source URLs.`
      : enrichment.fetchErrors.length > 0
      ? " Authoritative document fetch did not return verifiable numeric guidance — do not invent figures."
      : "";
  return {
    ...analysis,
    catalystEvidenceFacts,
    verifiedVsInferredGuidance: "See catalystEvidenceFacts verificationLevel — do not infer guidance beyond verified facts.",
    answerGuidance: `${priorGuidance}${factHint}`,
    authoritativeContentFetch: {
      attempted: true,
      urls: enrichment.contentFetchedUrls,
      errors: enrichment.fetchErrors,
    },
  };
}
