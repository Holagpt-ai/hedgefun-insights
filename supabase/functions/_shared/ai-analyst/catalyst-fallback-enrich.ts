/**
 * Fresh catalyst search enrichment — deterministic selection (mirror src).
 */

import { runBraveWebSearch, type BraveWebHit } from "./brave-search.ts";
import { catalystSessionDateFromQuestion } from "./catalyst-session-date.ts";
import {
  buildSelectionTrace,
  mergeRowsDeterministic,
  scoreCatalystRow,
  selectPrimaryFromScored,
  type CatalystRow,
} from "./catalyst-selection.ts";
import { inferEventTypeFromSearchEvidence } from "./catalyst-evidence-verification.ts";
import {
  attachEvidenceFactsToAnalysis,
  enrichAuthoritativeCatalystFacts,
} from "./catalyst-authoritative-enrich.ts";
import { fetchAuthoritativeHtml } from "./catalyst-authoritative-html-fetch.ts";
import { CATALYST_VERIFIED_VS_INFERRED_GUIDANCE } from "./catalyst-evidence-facts.ts";

type AnalystPacket = Record<string, unknown>;

const COMPANY_NAME: Record<string, string> = {
  MRVL: "Marvell",
  NVDA: "NVIDIA",
  AAPL: "Apple",
  TSLA: "Tesla",
  AMD: "AMD",
};

function discoverySkipReason(packet: AnalystPacket): string | null {
  const model = packet.MODEL_INTERPRETATION as Record<string, unknown> | undefined;
  const analysis = packet.CURRENT_CATALYST_ANALYSIS as Record<string, unknown> | undefined;
  if (model?.catalystAnswerMode !== "CURRENT_CATALYST_FIRST") return "not_current_catalyst_question";
  if (analysis?.verifiedPrimary === true) return "verified_primary_sufficient";
  return null;
}

function companyName(symbol: string): string | null {
  return COMPANY_NAME[symbol.toUpperCase()] ?? null;
}

function buildQueries(symbol: string, sessionDate: string): string[] {
  const co = companyName(symbol);
  return [
    `${symbol} ${co ?? ""} investor day guidance news ${sessionDate}`.replace(/\s+/g, " ").trim(),
    `${symbol} catalyst today ${sessionDate}`,
    co ? `${co} investor relations ${sessionDate}` : `${symbol} SEC filing ${sessionDate}`,
  ];
}

const OFFICIAL_SOURCE_HOST =
  /(?:^|\.)((?:investor|ir)\.[a-z0-9.-]+|sec\.gov|(?:www\.)?[a-z0-9-]+\.com\/(?:investor|ir|news\/press))/i;

function isOfficialUrl(url: string): boolean {
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

function normalizeHit(hit: BraveWebHit, symbol: string): CatalystRow {
  const title = hit.title?.trim() || "Search result";
  const official = isOfficialUrl(hit.url);
  return {
    eventType: inferEventTypeFromSearchEvidence(title, hit.snippet),
    eventDate: null,
    title,
    publishedAt: null,
    verificationState: official ? "provider_reported" : "web_search_unverified",
    sourceName: official ? "official_company_source" : "web_search",
    sourceUrl: hit.url,
    officialSource: official,
    evidenceOrigin: "fresh_web_search",
    attributionClass: official ? "direct" : "provider_associated",
    tickerSpecific: title.toUpperCase().includes(symbol) || official,
  };
}

function rebuildAnalysis(symbol: string, rows: CatalystRow[]) {
  const scored = rows.map(scoreCatalystRow);
  const primary = selectPrimaryFromScored(symbol, scored);
  const verifiedPrimary = primary != null;
  return {
    movementQuestion: true,
    verifiedPrimary,
    primaryCatalyst: primary
      ? {
        title: primary.row.title,
        eventType: primary.row.eventType,
        eventDate: primary.row.eventDate,
        publishedAt: primary.row.publishedAt,
        source: primary.row.sourceName,
        sourceUrl: primary.row.sourceUrl ?? null,
        officialSource: primary.row.officialSource ?? false,
        primaryClass: primary.precedence.primaryClass,
        classRank: primary.precedence.classRank,
      }
      : null,
    explicitNoVerifiedCatalyst: !verifiedPrimary,
    retrievalAttempted: true,
  };
}

export async function enrichAnalystIntelligenceWithFreshCatalystSearch(
  packet: AnalystPacket,
  options?: { userQuestion?: string | null; now?: Date },
): Promise<AnalystPacket> {
  const now = options?.now ?? new Date();
  const sessionDate = catalystSessionDateFromQuestion(options?.userQuestion, now);
  const symbol = String(packet.symbol ?? "").trim().toUpperCase();
  const skip = discoverySkipReason(packet);
  if (skip || !symbol) {
    console.log("[catalyst-pipeline]", JSON.stringify({
      skipped: true,
      reason: !symbol ? "missing_symbol" : skip,
      symbol,
      sessionDate,
    }));
    return packet;
  }
  const queries = buildQueries(symbol, sessionDate);
  const hits: BraveWebHit[] = [];
  for (const q of queries) {
    const batch = await runBraveWebSearch(q, 4);
    hits.push(...batch);
    if (hits.length >= 10) break;
  }

  const verified = packet.VERIFIED_FACTS as { catalystRows?: CatalystRow[] } | undefined;
  const internal = (verified?.catalystRows ?? []).map((r) => ({
    ...r,
    evidenceOrigin: "stocksist_catalyst" as const,
  }));
  const fromSearch = hits.map((h) => normalizeHit(h, symbol));
  const merged = mergeRowsDeterministic(internal, fromSearch);
  const primaryPick = selectPrimaryFromScored(symbol, merged.map(scoreCatalystRow));
  let analysis: Record<string, unknown> = {
    ...((packet.CURRENT_CATALYST_ANALYSIS as Record<string, unknown> | undefined) ?? {}),
    ...rebuildAnalysis(symbol, merged),
  };
  const authoritative = await enrichAuthoritativeCatalystFacts({
    primaryRow: primaryPick?.row ?? null,
    supportingRows: merged,
    fetchHtml: fetchAuthoritativeHtml,
  });
  if (analysis.verifiedPrimary === true) {
    analysis = attachEvidenceFactsToAnalysis(analysis, authoritative);
  } else {
    analysis.catalystEvidenceFacts = [];
    analysis.verifiedVsInferredGuidance = CATALYST_VERIFIED_VS_INFERRED_GUIDANCE;
  }
  const succeeded = analysis.verifiedPrimary === true;

  const pipelineTrace = buildSelectionTrace({
    symbol,
    searchQueries: queries,
    searchHitCount: hits.length,
    internalRowCount: internal.length,
    rows: merged,
    contentFetchedUrls: authoritative.contentFetchedUrls,
  });
  console.log("[catalyst-pipeline]", JSON.stringify(pipelineTrace));

  const discovery = {
    attempted: true,
    succeeded,
    searchQueries: queries,
    source: hits.length > 0 ? "brave_web_search" as const : null,
    error: hits.length === 0 ? "no_hits" : null,
  };

  const model = (packet.MODEL_INTERPRETATION ?? {}) as Record<string, unknown>;
  return {
    ...packet,
    VERIFIED_FACTS: {
      ...(verified ?? {}),
      catalystRows: merged,
    },
    CURRENT_CATALYST_ANALYSIS: analysis,
    FRESH_CATALYST_DISCOVERY: discovery,
    MODEL_INTERPRETATION: {
      ...model,
      freshDiscoveryAttempted: true,
      freshDiscoverySucceeded: succeeded,
      catalystAnswerGuidance: succeeded
        ? "Fresh web search supplemented internal catalyst data. Lead with verified primary catalyst from ranked evidence."
        : "Internal Stocksist catalyst data and fresh web search did not verify a company-specific primary catalyst. "
          + "State clearly that no confirmed company-specific catalyst was found in the available fresh sources.",
    },
  };
}
