import type { AnalystIntelligencePacket } from "@/lib/ai-analyst/intelligence-packet-types";
import { buildCurrentCatalystAnalysis } from "@/lib/ai-analyst/current-catalyst";
import { mergeAndSelectCatalystEvidence, scoreCatalystRow, selectPrimaryFromScored } from "@/lib/ai-analyst/catalyst-selection";
import type {
  AnalystCatalystRowWithProvenance,
  FreshCatalystDiscoveryMeta,
  WebSearchHit,
} from "@/lib/ai-analyst/catalyst-search-types";
import {
  extractExplicitMaterialFacts,
  inferEventTypeFromSearchEvidence,
} from "@/lib/ai-analyst/catalyst-evidence-verification";
import {
  attachEvidenceFactsToAnalysis,
  enrichAuthoritativeCatalystFacts,
  type AuthoritativeHtmlFetch,
} from "@/lib/ai-analyst/catalyst-authoritative-enrich";
import { catalystSessionDateFromQuestion } from "@/lib/ai-analyst/catalyst-session-date";

const OFFICIAL_SOURCE_HOST =
  /(?:^|\.)((?:investor|ir)\.[a-z0-9.-]+|sec\.gov|(?:www\.)?[a-z0-9-]+\.com\/(?:investor|ir|news\/press))/i;

const COMPANY_NAME_BY_SYMBOL: Record<string, string> = {
  MRVL: "Marvell",
  NVDA: "NVIDIA",
  AAPL: "Apple",
  TSLA: "Tesla",
  AMD: "AMD",
};

export function resolveCompanyName(symbol: string, override?: string | null): string | null {
  const fromOverride = override?.trim();
  if (fromOverride) return fromOverride;
  return COMPANY_NAME_BY_SYMBOL[symbol.toUpperCase()] ?? null;
}

export function isOfficialCompanySourceUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("sec.gov")) return true;
    if (host.startsWith("investor.") || host.startsWith("ir.")) return true;
    if (/\.(marvell|nvidia|apple|tesla|amd)\.com$/i.test(host) && /investor|ir|newsroom|press/i.test(url)) {
      return true;
    }
    return OFFICIAL_SOURCE_HOST.test(url);
  } catch {
    return false;
  }
}

export function shouldRunFreshCatalystSearch(
  packet: Pick<AnalystIntelligencePacket, "MODEL_INTERPRETATION" | "CURRENT_CATALYST_ANALYSIS">,
): boolean {
  if (packet.MODEL_INTERPRETATION.catalystAnswerMode !== "CURRENT_CATALYST_FIRST") return false;
  if (!packet.CURRENT_CATALYST_ANALYSIS) return true;
  return !packet.CURRENT_CATALYST_ANALYSIS.verifiedPrimary;
}

export function buildCatalystSearchQueries(input: {
  symbol: string;
  companyName?: string | null;
  sessionDateIso?: string;
  userQuestion?: string | null;
  now?: Date;
}): string[] {
  const symbol = input.symbol.trim().toUpperCase();
  const company = resolveCompanyName(symbol, input.companyName);
  const date = input.sessionDateIso?.slice(0, 10)
    ?? catalystSessionDateFromQuestion(input.userQuestion, input.now ?? new Date());
  const queries = [
    `${symbol} ${company ?? ""} investor day guidance news ${date}`.replace(/\s+/g, " ").trim(),
    `${symbol} catalyst today ${date}`,
    company ? `${company} investor relations ${date}` : `${symbol} SEC filing ${date}`,
    `${symbol} earnings guidance analyst ${date}`,
  ];
  return [...new Set(queries)];
}

/** Official hosts count only when the hit also names the asked symbol or its company. */
export function searchHitMatchesAskedSymbol(input: {
  symbol: string;
  title: string;
  snippet?: string | null;
  url: string;
}): boolean {
  const symbol = input.symbol.trim().toUpperCase();
  const company = resolveCompanyName(symbol);
  const upper = `${input.title} ${input.snippet ?? ""}`.toUpperCase();
  if (symbol && upper.includes(symbol)) return true;
  if (company && upper.includes(company.toUpperCase())) return true;
  try {
    const host = new URL(input.url).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "sec.gov" || host.endsWith(".sec.gov")) return false;
    const compactHost = host.replace(/[^a-z0-9]/g, "");
    if (symbol.length >= 2 && compactHost.includes(symbol.toLowerCase())) return true;
    if (company) {
      const stem = company.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (stem.length >= 4 && compactHost.includes(stem)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function normalizeWebSearchHit(
  hit: WebSearchHit,
  symbol: string,
): AnalystCatalystRowWithProvenance {
  const title = hit.title?.trim() || "Untitled search result";
  const eventType = inferEventTypeFromSearchEvidence(title, hit.snippet);
  const matched = searchHitMatchesAskedSymbol({
    symbol,
    title,
    snippet: hit.snippet,
    url: hit.url,
  });
  const official = matched && isOfficialCompanySourceUrl(hit.url);
  return {
    eventType,
    eventDate: hit.publishedAt?.slice(0, 10) ?? null,
    title,
    publishedAt: hit.publishedAt ?? new Date().toISOString(),
    verificationState: official ? "provider_reported" : "web_search_unverified",
    sourceName: official ? "official_company_source" : "web_search",
    sourceUrl: hit.url,
    officialSource: official,
    attributionClass: official ? "direct" : matched ? "provider_associated" : "unverified",
    tickerSpecific: matched,
    evidenceOrigin: "fresh_web_search",
  };
}

export async function enrichPacketWithSearchEvidence(input: {
  packet: AnalystIntelligencePacket;
  searchHits: WebSearchHit[];
  discovery: FreshCatalystDiscoveryMeta;
  fetchAuthoritativeHtml?: AuthoritativeHtmlFetch;
}): Promise<AnalystIntelligencePacket> {
  const symbol = input.packet.symbol;
  const internal = (input.packet.VERIFIED_FACTS.catalystRows ?? []).map((r) => ({
    ...r,
    evidenceOrigin: "stocksist_catalyst" as const,
  }));
  const fromSearch = input.searchHits.map((h) => normalizeWebSearchHit(h, symbol));
  const asOfDate = input.packet.CURRENT_SESSION_EVIDENCE.radar.tradingDate;
  const { analysis: built, trace, mergedRows: merged } = mergeAndSelectCatalystEvidence({
    symbol,
    internal,
    fromSearch,
    searchQueries: input.discovery.searchQueries,
    buildAnalysis: (asked, rows) => buildCurrentCatalystAnalysis(asked, rows, { asOfDate }),
  });
  let analysis = { ...built, retrievalAttempted: true };
  const primaryPick = selectPrimaryFromScored(symbol, merged.map(scoreCatalystRow), { asOfDate });
  const primaryRow = primaryPick?.row ?? null;
  const authoritative = await enrichAuthoritativeCatalystFacts({
    primaryRow: analysis.verifiedPrimary ? primaryRow : null,
    supportingRows: merged,
    fetchHtml: input.fetchAuthoritativeHtml,
  });
  analysis = attachEvidenceFactsToAnalysis(analysis, authoritative);
  analysis = {
    ...analysis,
    authoritativeContentFetch: {
      attempted: Boolean(input.fetchAuthoritativeHtml),
      urls: authoritative.contentFetchedUrls,
      errors: authoritative.fetchErrors,
      attempts: authoritative.fetchAttempts,
      deliveryStatus: authoritative.deliveryStatus,
    },
  };
  if (typeof globalThis !== "undefined" && "process" in globalThis) {
    // Server-side only; never included in client-facing packet fields.
    console.debug?.("[catalyst-pipeline]", JSON.stringify(trace));
  }

  const noCatalystAllowed =
    !analysis.verifiedPrimary && input.discovery.attempted && !input.discovery.succeeded;

  return {
    ...input.packet,
    VERIFIED_FACTS: {
      ...input.packet.VERIFIED_FACTS,
      catalystRows: merged,
    },
    CURRENT_CATALYST_ANALYSIS: analysis,
    FRESH_CATALYST_DISCOVERY: input.discovery,
    MODEL_INTERPRETATION: {
      ...input.packet.MODEL_INTERPRETATION,
      catalystAnswerGuidance: noCatalystAllowed
        ? "Internal Stocksist catalyst data and fresh web search did not verify a company-specific primary catalyst. "
          + "State clearly that no confirmed company-specific catalyst was found in the available fresh sources. "
          + "Sector/macro may be secondary only."
        : analysis.answerGuidance,
      freshDiscoveryAttempted: input.discovery.attempted,
      freshDiscoverySucceeded: input.discovery.succeeded,
    },
  };
}
