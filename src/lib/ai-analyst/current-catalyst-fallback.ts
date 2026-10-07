import type { AnalystIntelligencePacket } from "@/lib/ai-analyst/intelligence-packet-types";
import {
  buildCurrentCatalystAnalysis,
  type CurrentCatalystAnalysis,
} from "@/lib/ai-analyst/current-catalyst";
import type {
  AnalystCatalystRowWithProvenance,
  FreshCatalystDiscoveryMeta,
  WebSearchHit,
} from "@/lib/ai-analyst/catalyst-search-types";
function inferEventTypeFromText(text: string): string {
  if (/\b8[-\s]?k\b/i.test(text)) return "sec_filing_news";
  if (/\bearnings\b/i.test(text)) return "earnings";
  if (/\b(?:upgrade|downgrade|price target)\b/i.test(text)) return "analyst_action";
  if (/\b(?:investor day|analyst day|guidance)\b/i.test(text)) return "company_news";
  return "company_news";
}

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
}): string[] {
  const symbol = input.symbol.trim().toUpperCase();
  const company = resolveCompanyName(symbol, input.companyName);
  const date = input.sessionDateIso?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const queries = [
    `${symbol} ${company ?? ""} investor day guidance news ${date}`.replace(/\s+/g, " ").trim(),
    `${symbol} catalyst today ${date}`,
    company ? `${company} investor relations ${date}` : `${symbol} SEC filing ${date}`,
    `${symbol} earnings guidance analyst ${date}`,
  ];
  return [...new Set(queries)];
}

export function normalizeWebSearchHit(
  hit: WebSearchHit,
  symbol: string,
): AnalystCatalystRowWithProvenance {
  const title = hit.title?.trim() || "Untitled search result";
  const text = `${title} ${hit.snippet ?? ""}`;
  const eventType = inferEventTypeFromText(text);
  const official = isOfficialCompanySourceUrl(hit.url);
  return {
    eventType,
    eventDate: hit.publishedAt?.slice(0, 10) ?? null,
    title,
    publishedAt: hit.publishedAt ?? new Date().toISOString(),
    verificationState: official ? "provider_reported" : "web_search_unverified",
    sourceName: official ? "official_company_source" : "web_search",
    sourceUrl: hit.url,
    officialSource: official,
    attributionClass: official ? "direct" : "provider_associated",
    tickerSpecific: title.toUpperCase().includes(symbol.toUpperCase()) || official,
    evidenceOrigin: "fresh_web_search",
  };
}

export function mergeCatalystRowsForAnalysis(
  internal: readonly AnalystCatalystRowWithProvenance[],
  fromSearch: readonly AnalystCatalystRowWithProvenance[],
): AnalystCatalystRowWithProvenance[] {
  const seen = new Set<string>();
  const merged: AnalystCatalystRowWithProvenance[] = [];
  for (const row of [...internal, ...fromSearch]) {
    const key = `${row.sourceUrl ?? ""}|${row.title ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(row);
  }
  return merged.slice(0, 12);
}

export function enrichPacketWithSearchEvidence(input: {
  packet: AnalystIntelligencePacket;
  searchHits: WebSearchHit[];
  discovery: FreshCatalystDiscoveryMeta;
}): AnalystIntelligencePacket {
  const symbol = input.packet.symbol;
  const internal = (input.packet.VERIFIED_FACTS.catalystRows ?? []).map((r) => ({
    ...r,
    evidenceOrigin: "stocksist_catalyst" as const,
  }));
  const fromSearch = input.searchHits.map((h) => normalizeWebSearchHit(h, symbol));
  const merged = mergeCatalystRowsForAnalysis(internal, fromSearch);
  const analysis: CurrentCatalystAnalysis = {
    ...buildCurrentCatalystAnalysis(symbol, merged),
    retrievalAttempted: true,
  };

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
