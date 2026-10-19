/**
 * Match public headlines to symbols only when source metadata explicitly lists the ticker.
 * Does not infer relationships from headline text proximity.
 */

import { selectQualityMarketHeadlines } from "@/lib/news/market-headline-quality";
import type { MarketPulseRelatedHeadline } from "./market-pulse-contract";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function readRelatedSymbols(row: unknown): string[] {
  const raw = isRecord(row) ? row.related : undefined;
  if (typeof raw === "string") {
    return raw
      .split(/[,;|\s]+/)
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .map((part) => part.trim().toUpperCase());
  }
  return [];
}

function readHeadline(row: unknown): string | null {
  const raw = isRecord(row) ? row.headline : null;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function readUrl(row: unknown): string | null {
  const raw = isRecord(row) ? row.url : null;
  return typeof raw === "string" && raw.trim().startsWith("http") ? raw.trim() : null;
}

function readPublishedAt(row: unknown): string | null {
  const raw = isRecord(row) ? row.published_at : null;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return Number.isFinite(Date.parse(raw)) ? raw : null;
}

function readSource(row: unknown): string | null {
  const raw = isRecord(row) ? row.source : null;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/**
 * Returns a related headline only when `related` metadata explicitly includes `symbol`.
 */
export function matchExplicitSymbolHeadline(
  symbol: string,
  headlines: unknown[],
): MarketPulseRelatedHeadline | null {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return null;

  const quality = selectQualityMarketHeadlines(headlines, 40);
  for (const row of quality) {
    const related = readRelatedSymbols(row);
    if (!related.includes(normalized)) continue;
    const headline = readHeadline(row);
    const url = readUrl(row);
    const publishedAt = readPublishedAt(row);
    if (!headline || !url || !publishedAt) continue;
    return {
      headline,
      source: readSource(row),
      url,
      publishedAt,
      label: "Related headline",
    };
  }
  return null;
}
