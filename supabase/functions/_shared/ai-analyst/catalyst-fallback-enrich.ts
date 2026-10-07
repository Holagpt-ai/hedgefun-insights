/**
 * Deno mirror of src/lib/ai-analyst/current-catalyst-fallback.ts
 * Keep behavior aligned for chat preflight enrichment.
 */

import { classifyCatalystPrecedence } from "../catalyst/precedence.ts";
import { runBraveWebSearch, type BraveWebHit } from "./brave-search.ts";

type CatalystRow = {
  eventType: string;
  eventDate: string | null;
  title: string | null;
  publishedAt: string | null;
  verificationState: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  officialSource?: boolean;
  evidenceOrigin?: "stocksist_catalyst" | "fresh_web_search";
  attributionClass?: "direct" | "provider_associated" | "sector_related" | "unverified";
  tickerSpecific?: boolean;
};

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

function inferEventType(text: string): string {
  if (/\b8[-\s]?k\b/i.test(text)) return "sec_filing_news";
  if (/\bearnings\b/i.test(text)) return "earnings";
  if (/\b(?:upgrade|downgrade|price target)\b/i.test(text)) return "analyst_action";
  return "company_news";
}

function normalizeHit(hit: BraveWebHit, symbol: string): CatalystRow {
  const title = hit.title?.trim() || "Search result";
  const text = `${title} ${hit.snippet ?? ""}`;
  const official = isOfficialUrl(hit.url);
  return {
    eventType: inferEventType(text),
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

function sectorWide(title: string, symbol: string): boolean {
  const u = title.toUpperCase();
  if (u.includes(symbol.toUpperCase())) return false;
  return /\b(?:sector|stocks?|shares?|chip stocks|semiconductors?|ai stocks)\b/i.test(title);
}

function rankPrimary(symbol: string, rows: CatalystRow[]): { verifiedPrimary: boolean; primary: CatalystRow | null } {
  let best: { row: CatalystRow; rank: number } | null = null;
  for (const row of rows) {
    if (sectorWide(row.title ?? "", symbol)) continue;
    const precedence = classifyCatalystPrecedence({
      title: row.title ?? "",
      event_type: row.eventType,
      provider: row.officialSource ? "official_company_ir" : "stocksist_catalyst",
      event_date: row.eventDate ?? "",
      published_at: row.publishedAt,
      source_name: row.sourceName ?? null,
      attribution_class: row.attributionClass ?? "direct",
      ticker_specific: row.tickerSpecific ?? true,
    });
    if (precedence.tier !== "primary" || precedence.classRank <= 0) {
      if (row.eventType === "analyst_action" && /\b(?:upgrade|downgrade|price target)\b/i.test(row.title ?? "")) {
        const rank = 40 + (row.officialSource ? 10 : 0);
        if (!best || rank > best.rank) best = { row, rank };
      }
      continue;
    }
    const rank = precedence.classRank + (row.officialSource ? 15 : 0);
    if (!best || rank > best.rank) best = { row, rank };
  }
  return { verifiedPrimary: best != null, primary: best?.row ?? null };
}

function rebuildAnalysis(symbol: string, rows: CatalystRow[]) {
  const { verifiedPrimary, primary } = rankPrimary(symbol, rows);
  return {
    movementQuestion: true,
    verifiedPrimary,
    primaryCatalyst: primary
      ? {
        title: primary.title,
        eventType: primary.eventType,
        eventDate: primary.eventDate,
        publishedAt: primary.publishedAt,
        source: primary.sourceName,
        sourceUrl: primary.sourceUrl ?? null,
        officialSource: primary.officialSource ?? false,
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
  const merged = [...internal, ...fromSearch].slice(0, 12);
  const analysis = rebuildAnalysis(symbol, merged);
  const succeeded = analysis.verifiedPrimary === true;

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
