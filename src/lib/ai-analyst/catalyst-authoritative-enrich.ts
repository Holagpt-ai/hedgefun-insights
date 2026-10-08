import type { AnalystCatalystRow } from "@/lib/ai-analyst/intelligence-packet-types";
import {
  extractOfficialSameHostLinks,
  extractStructuredFactsFromPlainText,
  htmlToPlainText,
  isTrustedAttributedSecondaryUrl,
  type CatalystStructuredFact,
  type CatalystEvidenceVerificationLevel,
} from "@/lib/ai-analyst/catalyst-evidence-facts";

export type AuthoritativeHtmlFetch = (url: string) => Promise<string | null>;

export interface AuthoritativeEnrichmentResult {
  facts: CatalystStructuredFact[];
  contentFetchedUrls: string[];
  fetchErrors: string[];
}

export const AUTHORITATIVE_ENRICH_MAX_FETCHES = 2;
export const AUTHORITATIVE_ENRICH_MAX_BYTES = 512_000;

function verificationForUrl(url: string, fetched: boolean): CatalystEvidenceVerificationLevel {
  if (!fetched) return "headline_only";
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.endsWith(".pdf")) return "official_document";
  } catch {
    /* ignore */
  }
  if (isTrustedAttributedSecondaryUrl(url)) return "attributed_secondary";
  return "official_page";
}

function factsFromSnippet(snippet: string, url: string, level: CatalystEvidenceVerificationLevel) {
  return extractStructuredFactsFromPlainText(snippet, url, level);
}

export async function enrichAuthoritativeCatalystFacts(input: {
  primaryRow: AnalystCatalystRow | null;
  supportingRows: readonly AnalystCatalystRow[];
  fetchHtml?: AuthoritativeHtmlFetch;
  maxFetches?: number;
}): Promise<AuthoritativeEnrichmentResult> {
  const fetchHtml = input.fetchHtml;
  const maxFetches = input.maxFetches ?? AUTHORITATIVE_ENRICH_MAX_FETCHES;
  const contentFetchedUrls: string[] = [];
  const fetchErrors: string[] = [];
  const facts: CatalystStructuredFact[] = [];

  if (!input.primaryRow?.sourceUrl || !fetchHtml) {
    return { facts, contentFetchedUrls, fetchErrors };
  }

  const primaryUrl = input.primaryRow.sourceUrl;
  const queue: string[] = [primaryUrl];

  if (input.primaryRow.officialSource) {
    /* official primary first */
  } else if (isTrustedAttributedSecondaryUrl(primaryUrl)) {
    /* ok */
  } else {
    return { facts, contentFetchedUrls, fetchErrors };
  }

  while (queue.length > 0 && contentFetchedUrls.length < maxFetches) {
    const url = queue.shift()!;
    if (contentFetchedUrls.includes(url)) continue;
    let html: string | null = null;
    try {
      html = await fetchHtml(url);
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
    const level = verificationForUrl(url, true);
    const plain = html.includes("<") ? htmlToPlainText(html) : html;
    facts.push(...extractStructuredFactsFromPlainText(plain, url, level));

    if (url === primaryUrl && input.primaryRow.officialSource && contentFetchedUrls.length < maxFetches) {
      for (const link of extractOfficialSameHostLinks(html, url, 2)) {
        if (!queue.includes(link)) queue.push(link);
      }
    }
  }

  if (facts.length === 0) {
    for (const row of input.supportingRows) {
      if (!row.sourceUrl) continue;
      const snippet = row.title ?? "";
      const level: CatalystEvidenceVerificationLevel = row.officialSource
        ? "headline_only"
        : isTrustedAttributedSecondaryUrl(row.sourceUrl)
        ? "attributed_secondary"
        : "headline_only";
      if (level === "headline_only" && !row.officialSource) continue;
      facts.push(...factsFromSnippet(`${snippet}`, row.sourceUrl, level));
      if (facts.length > 0) break;
    }
  }

  const deduped = dedupeByKey(facts);
  return { facts: deduped, contentFetchedUrls, fetchErrors };
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

export function attachEvidenceFactsToAnalysis<
  T extends { answerGuidance: string; catalystEvidenceFacts?: CatalystStructuredFact[] },
>(analysis: T, enrichment: AuthoritativeEnrichmentResult): T {
  const catalystEvidenceFacts = enrichment.facts;
  const factHint =
    catalystEvidenceFacts.length > 0
      ? ` Verified event facts (${catalystEvidenceFacts.length}) are in catalystEvidenceFacts — cite them in KEY DETAILS with source URLs.`
      : enrichment.fetchErrors.length > 0
      ? " Authoritative document fetch did not return verifiable numeric guidance — do not invent figures."
      : "";
  return {
    ...analysis,
    catalystEvidenceFacts,
    answerGuidance: `${analysis.answerGuidance}${factHint}`,
  };
}
