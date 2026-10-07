/**
 * Fresh catalyst search enrichment — deterministic selection (mirror src).
 */

import { runBraveWebSearch, type BraveWebHit } from "./brave-search.ts";
import {
  buildSelectionTrace,
  mergeRowsDeterministic,
  scoreCatalystRow,
  selectPrimaryFromScored,
  type CatalystRow,
} from "./catalyst-selection.ts";
import { inferEventTypeFromSearchEvidence } from "./catalyst-evidence-verification.ts";

type AnalystPacket = Record<string, unknown>;

const COMPANY_NAME: Record<string, string> = {
  MRVL: "Marvell",
  NVDA: "NVIDIA",
  AAPL: "Apple",
  TSLA: "Tesla",
  AMD: "AMD",
};

function shouldRun(packet: AnalystPacket): boolean {
  const model = packet.MODEL_INTERPRETATION as Record<string, unknown> | undefined;
  const analysis = packet.CURRENT_CATALYST_ANALYSIS as Record<string, unknown> | undefined;
  if (model?.catalystAnswerMode !== "CURRENT_CATALYST_FIRST") return false;
  if (!analysis) return true;
  return analysis.verifiedPrimary !== true;
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

function isOfficialUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h.includes("sec.gov")) return true;
    if (h.startsWith("investor.") || h.startsWith("ir.")) return true;
    return /investor|ir|newsroom|press/i.test(url);
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
    publishedAt: new Date().toISOString(),
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
): Promise<AnalystPacket> {
  if (!shouldRun(packet)) return packet;

  const symbol = String(packet.symbol ?? "").trim().toUpperCase();
  if (!symbol) return packet;

  const sessionDate = new Date().toISOString().slice(0, 10);
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
  const analysis = rebuildAnalysis(symbol, merged);
  const succeeded = analysis.verifiedPrimary === true;

  const pipelineTrace = buildSelectionTrace({
    symbol,
    searchQueries: queries,
    searchHitCount: hits.length,
    internalRowCount: internal.length,
    rows: merged,
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
