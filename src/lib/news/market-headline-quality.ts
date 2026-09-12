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

const OFFICIAL_AGENCY = String.raw`(?:sec|doj|ftc|cftc|fda|securities and exchange commission|department of justice|federal trade commission|commodity futures trading commission|food and drug administration|attorney general|regulators?)`;

const OFFICIAL_ACTIONS = String.raw`(?:charg(?:e|es|ed)|sue[ds]?|fil(?:e|es|ed)|open(?:s|ed)?|launch(?:es|ed)?|order(?:s|ed)?|fine[sd]?|settl(?:e|es|ed|ement)|approv(?:e|es|ed)|reject(?:s|ed)?|halt(?:s|ed)?|subpoena(?:s|ed)?|impos(?:e|es|ed)|investigat(?:e|es|ed)|indictment|criminal charges?)`;

const COURT_ACTOR = String.raw`(?:federal )?(?:court|judge|jury)`;

const COURT_ACTIONS = String.raw`(?:rul(?:e|es|ed)|dismiss(?:es|ed)?|finds?|found|order(?:s|ed)?|block(?:s|ed)?)`;

/** Official actor + material action. Bare agency mentions are not enough. */
const GENUINE_REGULATORY_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\b${OFFICIAL_AGENCY}\b.{0,48}\b${OFFICIAL_ACTIONS}\b`),
  new RegExp(String.raw`\b${OFFICIAL_ACTIONS}\b.{0,32}\b(?:by|from)\b.{0,24}\b${OFFICIAL_AGENCY}\b`),
  new RegExp(String.raw`\b(?:charged|sued|fined|subpoenaed|investigated)\b.{0,32}\b(?:by|from)\b.{0,24}\b${OFFICIAL_AGENCY}\b`),
  new RegExp(String.raw`\b${COURT_ACTOR}\b.{0,48}\b${COURT_ACTIONS}\b`),
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

type RankedCandidate<T> = {
  row: T;
  index: number;
  materiality: number;
  publishedAt: string;
  identities: string[];
};

/**
 * Preserve original row objects. Validate and filter first, rank by
 * materiality and publication time, then deduplicate and apply the limit.
 */
export function selectQualityMarketHeadlines<T>(rows: T[], limit: number): T[] {
  if (!Array.isArray(rows) || limit <= 0) return [];

  const candidates: RankedCandidate<T>[] = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const headline = readHeadline(row);
    const publishedAt = readPublishedAt(row);
    if (!headline || !publishedAt) continue;
    if (!headlineFingerprint(headline)) continue;
    if (isPromotionalLegalNotice(headline)) continue;

    candidates.push({
      row,
      index,
      materiality: materialityScore(headline, readRelatedSymbols(row)),
      publishedAt,
      identities: rowIdentities(row, headline),
    });
  }

  candidates.sort((a, b) => {
    if (b.materiality !== a.materiality) return b.materiality - a.materiality;
    const publishedCmp = b.publishedAt.localeCompare(a.publishedAt);
    if (publishedCmp !== 0) return publishedCmp;
    return a.index - b.index;
  });

  const seen = new Set<string>();
  const selected: T[] = [];
  for (const candidate of candidates) {
    if (candidate.identities.some((key) => seen.has(key))) continue;
    for (const key of candidate.identities) seen.add(key);
    selected.push(candidate.row);
    if (selected.length >= limit) break;
  }
  return selected;
}
