/**
 * Deterministic Market Headlines relevance pipeline.
 * Rank by materiality/relevance first, publication time second.
 * Never fabricates translations. Never implies unverified freshness.
 */

import { canonicalUrl, normalizeHeadline, normalizeSymbol } from "@/lib/catalyst/attribution";

export interface RawHeadline {
  id: unknown;
  headline: unknown;
  source: unknown;
  url: unknown;
  published_at: unknown;
  related?: unknown;
  category?: unknown;
  headline_en?: unknown;
  lang?: unknown;
}

export interface RankedHeadline {
  id: string;
  headline: string;
  source: string | null;
  url: string | null;
  published_at: string;
  symbols: string[];
  materiality: number;
  language: "en" | "other" | "unknown";
  english_title_used: boolean;
}

export const FEED_SYNC_UNAVAILABLE = "Feed synchronization status unavailable";

const US_EQUITY = /^[A-Z]{1,5}(?:[.-][A-Z]{1,4})?$/;

const MACRO_PATTERNS: RegExp[] = [
  /\b(?:fed|fomc|cpi|ppi|jobs report|nonfarm|unemployment|treasury|yields?|inflation|gdp|ecb|bank of japan|oil|crude|opec)\b/i,
  /\b(?:s&p 500|dow jones|nasdaq|russell 2000|wall street|us stocks?|u\.s\. stocks?)\b/i,
  /\b(?:market(?:s)? (?:rally|selloff|sell-off|plunge|surge|open|close))\b/i,
];

const LOW_MATERIALITY: RegExp[] = [
  /\b(?:ex[- ]dividend|ex-div)\b/i,
  /\b(?:annual meeting|shareholder meeting)\b/i,
  /\b(?:conference(?: presentation)?(?: date)?|investor day)\b/i,
  /\b(?:routine|ordinary)\s+(?:notice|filing)\b/i,
  /\bform\s+(?:3|4|5)\b/i,
  /\b(?:13[dgf]|schedule 13)\b/i,
  /\b(?:name change|ticker symbol change)\b/i,
  /\b(?:quiet period)\b/i,
];

const HIGH_MATERIALITY: RegExp[] = [
  /\b(?:bankruptcy|chapter 11|halt(?:ed)?|investigation|downgrade|upgrade|guidance|acquisition|merger|fda|earnings|profit warning|restatement)\b/i,
  /\b(?:beats?|misses?)\s+(?:estimates?|expectations?)\b/i,
];

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  return Number.isFinite(Date.parse(v)) ? v : null;
}

function looksEnglish(text: string): boolean {
  const letters = text.replace(/[^A-Za-z\u00C0-\u024F]/g, "");
  if (letters.length < 8) return true;
  let asciiCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) <= 0x7f) asciiCount += 1;
  }
  const englishHits = (text.match(/\b(?:the|and|of|to|in|for|on|us|u\.s\.|stock|market|says|after)\b/gi) ?? []).length;
  return asciiCount / Math.max(text.length, 1) > 0.85 && englishHits >= 1;
}

function relatedSymbols(raw: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const n = normalizeSymbol(s);
    if (!n || seen.has(n) || !US_EQUITY.test(n)) return;
    // Skip obvious non-US / crypto / fx prefixes.
    if (n.includes(":") || n.startsWith("I:")) return;
    seen.add(n);
    out.push(n);
  };
  if (typeof raw === "string") {
    for (const part of raw.split(/[,;|\s]+/)) push(part);
  } else if (Array.isArray(raw)) {
    for (const p of raw) {
      if (typeof p === "string") push(p);
    }
  }
  return out;
}

export function materialityScore(headline: string, symbols: string[]): number {
  let score = 10;
  if (MACRO_PATTERNS.some((p) => p.test(headline))) score += 40;
  if (HIGH_MATERIALITY.some((p) => p.test(headline))) score += 30;
  if (symbols.length === 1) score += 20;
  else if (symbols.length >= 2 && symbols.length <= 3) score += 8;
  if (LOW_MATERIALITY.some((p) => p.test(headline))) score -= 50;
  return score;
}

export function shouldExcludeRoutine(headline: string, symbols: string[]): boolean {
  if (!LOW_MATERIALITY.some((p) => p.test(headline))) return false;
  if (HIGH_MATERIALITY.some((p) => p.test(headline))) return false;
  if (MACRO_PATTERNS.some((p) => p.test(headline))) return false;
  return symbols.length === 0 || materialityScore(headline, symbols) < 10;
}

export function rankHeadlines(raw: RawHeadline[], limit = 8): RankedHeadline[] {
  const seen = new Set<string>();
  const rows: RankedHeadline[] = [];

  for (const r of raw) {
    const englishVariant = typeof r.headline_en === "string" ? r.headline_en.trim() : "";
    const original = typeof r.headline === "string" ? r.headline.trim() : "";
    const englishUsed = englishVariant.length > 0;
    const headline = englishUsed ? englishVariant : original;
    const published = isoOrNull(r.published_at);
    if (!headline || !published) continue;

    let language: RankedHeadline["language"] = "unknown";
    if (englishUsed || looksEnglish(headline)) language = "en";
    else language = "other";

    // Do not fabricate a translation; keep original if no English variant.
    const url = typeof r.url === "string" && r.url.startsWith("https://") ? r.url : null;
    const key =
      (typeof r.id === "string" || typeof r.id === "number" ? `id:${r.id}` : "") ||
      (canonicalUrl(url) ? `url:${canonicalUrl(url)}` : "") ||
      `h:${normalizeHeadline(headline)}`;
    if (seen.has(key) || seen.has(`h:${normalizeHeadline(headline)}`)) continue;
    seen.add(key);
    seen.add(`h:${normalizeHeadline(headline)}`);

    const symbols = relatedSymbols(r.related);
    if (shouldExcludeRoutine(headline, symbols)) continue;

    rows.push({
      id: String(r.id ?? key),
      headline,
      source: typeof r.source === "string" ? r.source : null,
      url,
      published_at: published,
      symbols,
      materiality: materialityScore(headline, symbols),
      language,
      english_title_used: englishUsed,
    });
  }

  rows.sort((a, b) => {
    if (b.materiality !== a.materiality) return b.materiality - a.materiality;
    return b.published_at.localeCompare(a.published_at);
  });
  return rows.slice(0, Math.max(0, limit));
}
