/**
 * Client-side PM Inbox market headline selector.
 * Filters, deduplicates, and ranks rows without mutating the original objects.
 */

import { materialityScore } from "@/lib/pre-market/headlines";

export const MARKET_HEADLINE_CANDIDATE_POOL = 80;

const TRACKING_PARAMS = new Set(["ref", "source", "campaign"]);

const HARMLESS_PREFIX = /^(?:breaking|update)\s*:\s*/i;

const PROMOTIONAL_LEGAL_PATTERNS: RegExp[] = [
  /\bshareholder alert\b/,
  /\bsecurities class action\b/,
  /\blead plaintiff\b/,
  /\blaw firm reminder\b/,
  /\blaw firm reminds\b/,
  /\binvestors? who suffered losses\b/,
  /\bclass action deadline\b/,
  /\bnotice to shareholders\b/,
  /\binvestigation announced by (?:a )?law firm\b/,
  /\blaw firm announces? (?:an? )?investigation\b/,
  /\blaw firm\b.{0,80}\b(?:class action|lead plaintiff|shareholder alert)\b/,
  /\b(?:class action|lead plaintiff|shareholder alert)\b.{0,80}\blaw firm\b/,
];

const GENUINE_REGULATORY_PATTERNS: RegExp[] = [
  /\bsec\b/,
  /\bdoj\b/,
  /\bftc\b/,
  /\bcftc\b/,
  /\bfda\b/,
  /\bsecurities and exchange commission\b/,
  /\bdepartment of justice\b/,
  /\bfederal trade commission\b/,
  /\bcommodity futures trading commission\b/,
  /\bfood and drug administration\b/,
  /\battorney general\b/,
  /\b(?:court|judge|jury)\b/,
  /\bindictment\b/,
  /\bcriminal charges?\b/,
  /\bgovernment investigation\b/,
  /\bofficial investigation\b/,
  /\bregulator(?:y)?[- ]imposed\b/,
  /\bregulators?\b.{0,48}\b(?:fine[sd]?|settlement|settles|impose[sd]?)\b/,
  /\b(?:sec|doj|ftc|cftc|fda|regulator(?:y)?|commission)\b.{0,48}\b(?:fine[sd]?|settlement|settles)\b/,
  /\b(?:fine[sd]?|settlement|settles)\b.{0,48}\b(?:sec|doj|ftc|cftc|fda|regulator(?:y)?|commission)\b/,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function readField(row: unknown, key: string): unknown {
  return isRecord(row) ? row[key] : undefined;
}

function readHeadline(row: unknown): string | null {
  const raw = readField(row, "headline");
  if (typeof raw !== "string") return null;
  const headline = raw.trim();
  return headline.length > 0 ? headline : null;
}

function readPublishedAt(row: unknown): string | null {
  const raw = readField(row, "published_at");
  if (typeof raw !== "string" || !raw.trim()) return null;
  return Number.isFinite(Date.parse(raw)) ? raw : null;
}

function readId(row: unknown): string | null {
  const raw = readField(row, "id");
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  return null;
}

function readRelatedSymbols(row: unknown): string[] {
  const raw = readField(row, "related");
  if (typeof raw === "string") {
    return raw
      .split(/[,;|\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.filter((part): part is string => typeof part === "string" && part.trim().length > 0);
  }
  return [];
}

function legalHaystack(headline: string): string {
  return headline.toLowerCase().replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
}

function isGenuineRegulatoryNews(headline: string): boolean {
  const hay = legalHaystack(headline);
  return GENUINE_REGULATORY_PATTERNS.some((pattern) => pattern.test(hay));
}

function isPromotionalLegalNotice(headline: string): boolean {
  if (isGenuineRegulatoryNews(headline)) return false;
  const hay = legalHaystack(headline);
  return PROMOTIONAL_LEGAL_PATTERNS.some((pattern) => pattern.test(hay));
}

/** Canonical URL identity: drop fragments, trailing slash, and tracking params. */
export function normalizeCanonicalUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";

    const kept = [...url.searchParams.entries()]
      .filter(([key]) => {
        const name = key.toLowerCase();
        return !name.startsWith("utm_") && !TRACKING_PARAMS.has(name);
      })
      .sort(([a], [b]) => a.localeCompare(b));

    url.search = "";
    for (const [key, value] of kept) {
      url.searchParams.append(key, value);
    }

    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return null;
  }
}

/** Deterministic headline identity. Ignores case, punctuation, and harmless prefixes. */
export function headlineFingerprint(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let text = raw.trim().toLowerCase();
  for (let i = 0; i < 3; i += 1) {
    const next = text.replace(HARMLESS_PREFIX, "");
    if (next === text) break;
    text = next;
  }
  return text.replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
}

function rowIdentities(row: unknown, headline: string): string[] {
  const identities: string[] = [];
  const url = normalizeCanonicalUrl(readField(row, "url"));
  const fingerprint = headlineFingerprint(headline);
  const id = readId(row);
  if (url) identities.push(`url:${url}`);
  if (fingerprint) identities.push(`fp:${fingerprint}`);
  if (id) identities.push(`id:${id}`);
  return identities;
}

/**
 * Preserve original row objects. Reject blanks/invalid timestamps, suppress
 * promotional legal solicitations, drop deterministic duplicates, then rank
 * by materiality and publication time.
 */
export function selectQualityMarketHeadlines<T>(rows: T[], limit: number): T[] {
  if (!Array.isArray(rows) || limit <= 0) return [];

  const seen = new Set<string>();
  const accepted: T[] = [];

  for (const row of rows) {
    const headline = readHeadline(row);
    const publishedAt = readPublishedAt(row);
    if (!headline || !publishedAt) continue;
    if (!headlineFingerprint(headline)) continue;
    if (isPromotionalLegalNotice(headline)) continue;

    const identities = rowIdentities(row, headline);
    if (identities.some((key) => seen.has(key))) continue;
    for (const key of identities) seen.add(key);
    accepted.push(row);
  }

  accepted.sort((a, b) => {
    const headlineA = readHeadline(a) ?? "";
    const headlineB = readHeadline(b) ?? "";
    const scoreA = materialityScore(headlineA, readRelatedSymbols(a));
    const scoreB = materialityScore(headlineB, readRelatedSymbols(b));
    if (scoreB !== scoreA) return scoreB - scoreA;
    const publishedA = readPublishedAt(a) ?? "";
    const publishedB = readPublishedAt(b) ?? "";
    return publishedB.localeCompare(publishedA);
  });

  return accepted.slice(0, limit);
}
