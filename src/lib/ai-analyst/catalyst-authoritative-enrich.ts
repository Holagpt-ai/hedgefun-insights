import type { AnalystCatalystRow } from "@/lib/ai-analyst/intelligence-packet-types";
import {
  classifyCatalystFetchUrl,
  extractOfficialSameHostLinks,
  extractStructuredFactsFromPlainText,
  htmlToPlainText,
  isTrustedAttributedSecondaryUrl,
  type CatalystStructuredFact,
  type CatalystEvidenceVerificationLevel,
} from "@/lib/ai-analyst/catalyst-evidence-facts";

export type AuthoritativeHtmlFetch = (url: string) => Promise<string | null>;

export interface AuthoritativeFetchResult {
  httpStatus: number | null;
  contentType: string | null;
  body: string;
}

export type AuthoritativeContentFetch = (url: string) => Promise<AuthoritativeFetchResult | null>;

export type CatalystFetchOutcome =
  | "ok_with_facts"
  | "ok_no_facts"
  | "http_error"
  | "empty_body"
  | "pdf_skipped"
  | "rss_skipped"
  | "oversized"
  | "fetch_failed"
  | "invalid_url";

export interface CatalystSourceFetchAttempt {
  url: string;
  httpStatus: number | null;
  contentType: string | null;
  factCount: number;
  outcome: CatalystFetchOutcome;
}

export interface AuthoritativeEnrichmentResult {
  facts: CatalystStructuredFact[];
  contentFetchedUrls: string[];
  fetchErrors: string[];
  fetchAttempts: CatalystSourceFetchAttempt[];
  deliveryStatus: "facts_delivered" | "no_verifiable_facts" | "not_attempted";
}

export const AUTHORITATIVE_ENRICH_MAX_FETCHES = 3;
export const AUTHORITATIVE_ENRICH_MAX_BYTES = 512_000;

function verificationForUrl(url: string): CatalystEvidenceVerificationLevel {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.endsWith(".pdf")) return "official_document";
  } catch {
    /* ignore */
  }
  if (isTrustedAttributedSecondaryUrl(url)) return "attributed_secondary";
  return "official_page";
}

function resolveContentFetch(input: {
  fetchContent?: AuthoritativeContentFetch;
  fetchHtml?: AuthoritativeHtmlFetch;
}): AuthoritativeContentFetch | undefined {
  if (input.fetchContent) return input.fetchContent;
  if (!input.fetchHtml) return undefined;
  return async (url) => {
    try {
      const body = await input.fetchHtml!(url);
      if (body == null) return { httpStatus: null, contentType: null, body: "" };
      return { httpStatus: 200, contentType: "text/html", body };
    } catch {
      return { httpStatus: null, contentType: null, body: "" };
    }
  };
}

function secondaryRecoveryUrls(
  supportingRows: readonly AnalystCatalystRow[],
  primaryUrl: string,
): string[] {
  const urls: string[] = [];
  for (const row of supportingRows) {
    const url = row.sourceUrl?.trim();
    if (!url || url === primaryUrl) continue;
    if (!isTrustedAttributedSecondaryUrl(url)) continue;
    if (urls.includes(url)) continue;
    urls.push(url);
    if (urls.length >= 2) break;
  }
  return urls;
}

function recordAttempt(
  attempts: CatalystSourceFetchAttempt[],
  entry: CatalystSourceFetchAttempt,
): void {
  attempts.push(entry);
}

async function fetchAndExtract(input: {
  url: string;
  fetchContent: AuthoritativeContentFetch;
  contentFetchedUrls: string[];
  fetchErrors: string[];
  fetchAttempts: CatalystSourceFetchAttempt[];
  facts: CatalystStructuredFact[];
}): Promise<string | null> {
  const { url } = input;
  const urlKind = classifyCatalystFetchUrl(url);
  if (urlKind === "pdf_skip") {
    input.fetchErrors.push(`${url}: pdf_skipped`);
    recordAttempt(input.fetchAttempts, {
      url,
      httpStatus: null,
      contentType: "application/pdf",
      factCount: 0,
      outcome: "pdf_skipped",
    });
    return null;
  }
  if (urlKind === "rss_skip") {
    input.fetchErrors.push(`${url}: rss_skipped`);
    recordAttempt(input.fetchAttempts, {
      url,
      httpStatus: null,
      contentType: "application/rss+xml",
      factCount: 0,
      outcome: "rss_skipped",
    });
    return null;
  }
  if (urlKind === "invalid") {
    input.fetchErrors.push(`${url}: invalid_url`);
    recordAttempt(input.fetchAttempts, {
      url,
      httpStatus: null,
      contentType: null,
      factCount: 0,
      outcome: "invalid_url",
    });
    return null;
  }

  let fetched: AuthoritativeFetchResult | null = null;
  try {
    fetched = await input.fetchContent(url);
  } catch (err) {
    input.fetchErrors.push(`${url}: ${err instanceof Error ? err.message : "fetch_failed"}`);
    recordAttempt(input.fetchAttempts, {
      url,
      httpStatus: null,
      contentType: null,
      factCount: 0,
      outcome: "fetch_failed",
    });
    return null;
  }

  if (!fetched) {
    input.fetchErrors.push(`${url}: fetch_failed`);
    recordAttempt(input.fetchAttempts, {
      url,
      httpStatus: null,
      contentType: null,
      factCount: 0,
      outcome: "fetch_failed",
    });
    return null;
  }

  const { httpStatus, contentType, body } = fetched;
  if (httpStatus != null && httpStatus >= 400) {
    input.fetchErrors.push(`${url}: http_${httpStatus}`);
    recordAttempt(input.fetchAttempts, {
      url,
      httpStatus,
      contentType,
      factCount: 0,
      outcome: "http_error",
    });
    return null;
  }

  if (!body.trim()) {
    input.fetchErrors.push(`${url}: empty_body`);
    recordAttempt(input.fetchAttempts, {
      url,
      httpStatus,
      contentType,
      factCount: 0,
      outcome: "empty_body",
    });
    return null;
  }

  if (body.length > AUTHORITATIVE_ENRICH_MAX_BYTES) {
    input.fetchErrors.push(`${url}: body_too_large`);
    recordAttempt(input.fetchAttempts, {
      url,
      httpStatus,
      contentType,
      factCount: 0,
      outcome: "oversized",
    });
    return null;
  }

  input.contentFetchedUrls.push(url);
  const level = verificationForUrl(url);
  const plain = body.includes("<") ? htmlToPlainText(body) : body;
  const extracted = extractStructuredFactsFromPlainText(plain, url, level);
  input.facts.push(...extracted);

  recordAttempt(input.fetchAttempts, {
    url,
    httpStatus,
    contentType,
    factCount: extracted.length,
    outcome: extracted.length > 0 ? "ok_with_facts" : "ok_no_facts",
  });

  return body;
}

export async function enrichAuthoritativeCatalystFacts(input: {
  primaryRow: AnalystCatalystRow | null;
  supportingRows: readonly AnalystCatalystRow[];
  fetchHtml?: AuthoritativeHtmlFetch;
  fetchContent?: AuthoritativeContentFetch;
  maxFetches?: number;
}): Promise<AuthoritativeEnrichmentResult> {
  const fetchContent = resolveContentFetch(input);
  const maxFetches = input.maxFetches ?? AUTHORITATIVE_ENRICH_MAX_FETCHES;
  const contentFetchedUrls: string[] = [];
  const fetchErrors: string[] = [];
  const fetchAttempts: CatalystSourceFetchAttempt[] = [];
  const facts: CatalystStructuredFact[] = [];

  if (!input.primaryRow?.sourceUrl || !fetchContent) {
    return {
      facts,
      contentFetchedUrls,
      fetchErrors,
      fetchAttempts,
      deliveryStatus: "not_attempted",
    };
  }

  const primaryUrl = input.primaryRow.sourceUrl;
  const officialPrimary = input.primaryRow.officialSource === true;
  if (!officialPrimary && !isTrustedAttributedSecondaryUrl(primaryUrl)) {
    return {
      facts,
      contentFetchedUrls,
      fetchErrors,
      fetchAttempts,
      deliveryStatus: "not_attempted",
    };
  }

  const queue: string[] = [primaryUrl];
  const queued = new Set<string>([primaryUrl]);

  while (queue.length > 0 && contentFetchedUrls.length < maxFetches) {
    const url = queue.shift()!;
    if (contentFetchedUrls.includes(url)) continue;

    const beforeFacts = facts.length;
    const fetchedBody = await fetchAndExtract({
      url,
      fetchContent,
      contentFetchedUrls,
      fetchErrors,
      fetchAttempts,
      facts,
    });

    if (url === primaryUrl && officialPrimary && fetchedBody?.includes("<") && contentFetchedUrls.length < maxFetches) {
      for (const link of extractOfficialSameHostLinks(fetchedBody, url, 3)) {
        if (queued.has(link) || link === primaryUrl) continue;
        queued.add(link);
        queue.push(link);
      }
    }

    if (facts.length === beforeFacts && url === primaryUrl && officialPrimary) {
      for (const secondaryUrl of secondaryRecoveryUrls(input.supportingRows, primaryUrl)) {
        if (queued.has(secondaryUrl)) continue;
        queued.add(secondaryUrl);
        queue.push(secondaryUrl);
      }
    }
  }

  const deduped = dedupeByKey(facts);
  return {
    facts: deduped,
    contentFetchedUrls,
    fetchErrors,
    fetchAttempts,
    deliveryStatus: deduped.length > 0 ? "facts_delivered" : "no_verifiable_facts",
  };
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
      : enrichment.fetchAttempts.some((a) => a.outcome === "ok_no_facts" || a.outcome === "http_error")
      ? " Authoritative sources were fetched but did not contain verifiable numeric guidance in body text — do not invent figures."
      : enrichment.fetchErrors.length > 0
      ? " Authoritative document fetch did not return verifiable numeric guidance — do not invent figures."
      : "";
  return {
    ...analysis,
    catalystEvidenceFacts,
    answerGuidance: `${analysis.answerGuidance}${factHint}`,
  };
}
