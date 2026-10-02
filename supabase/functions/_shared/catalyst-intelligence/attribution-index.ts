import { normalizeTicker } from "./normalize.ts";
import type { CompanyRecord } from "./types.ts";

/** Tokens that must not alone establish issuer identity for NEWS_PR. */
export const GENERIC_IDENTITY_TOKENS = new Set([
  "company", "group", "holdings", "usa", "llc", "inc", "corporation", "corp",
  "financial", "international", "limited", "ltd", "plc", "the", "and", "for",
  "co", "lp", "nv", "sa", "llp", "trust", "partners", "capital", "services",
  "global", "national", "america", "american", "industries", "systems",
  "technologies", "technology", "therapeutics", "pharmaceutical", "pharma",
  "announces", "announce", "report", "reports", "results", "conference", "call",
  "quarterly", "annual", "host", "will", "scheduled", "release", "operating",
]);

const BARE_TICKER_STOP = new Set([
  "ALL", "FOR", "THE", "AND", "CAN", "NOW", "NEW", "SEE", "LOW", "BIG",
  "OUT", "ONE", "ANY", "HAS", "NOT", "BUT", "YOU", "OUR", "DAY", "MAY",
  "ARE", "WAS", "HIS", "HER", "WHO", "HOW", "WHY", "TOO", "OLD", "HOT", "TOP",
]);

export function normalizePhrase(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function tokenize(value: string): string[] {
  return normalizePhrase(value).split(/\s+/).filter(Boolean);
}

export function meaningfulNameTokens(name: string): string[] {
  return tokenize(name).filter((t) => t.length >= 3 && !GENERIC_IDENTITY_TOKENS.has(t));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function companyTokensLegacy(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((t) => t.length >= 3);
}

export function legacyTextHasName(text: string, name: string): boolean {
  const tokens = companyTokensLegacy(name);
  if (tokens.length === 0) return false;
  const phrase = tokens.join(" ");
  if (phrase.length < 4) return false;
  const pattern = tokens.map(escapeRegExp).join("\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:$|[^a-z0-9])`, "i").test(text);
}

function containsWholePhrase(haystack: string, needle: string): boolean {
  if (!needle || needle.length < 4) return false;
  const pattern = needle.split(/\s+/).map(escapeRegExp).join("\\s+");
  return new RegExp(`(?:^|\\s)${pattern}(?:\\s|$)`).test(haystack);
}

interface NewsNameProfile {
  exactPhrase: string;
  meaningful: string[];
}

function buildNewsProfiles(name: string): NewsNameProfile {
  return {
    exactPhrase: normalizePhrase(name),
    meaningful: meaningfulNameTokens(name),
  };
}

function newsProfileMatches(titlePhrase: string, titleTokens: Set<string>, profile: NewsNameProfile): boolean {
  if (profile.exactPhrase.length >= 4 && containsWholePhrase(titlePhrase, profile.exactPhrase)) {
    return true;
  }
  if (profile.meaningful.length >= 2) {
    if (profile.meaningful.every((t) => titleTokens.has(t))) return true;
    if (containsWholePhrase(titlePhrase, profile.meaningful.join(" "))) return true;
  }
  if (profile.meaningful.length === 1) {
    const token = profile.meaningful[0];
    if (token.length >= 5 && titleTokens.has(token)) return true;
    if (token.length >= 4 && containsWholePhrase(titlePhrase, token)) return true;
  }
  return false;
}

export interface AttributionIndex {
  readonly companies: readonly CompanyRecord[];
  findMentionedTickers(text: string): string[];
  findLegacyNameTickers(text: string): Set<string>;
  findNewsNameTickers(title: string): Set<string>;
}

export function buildAttributionIndex(companies: readonly CompanyRecord[]): AttributionIndex {
  const tickerSet = new Set<string>();
  const profiles: { ticker: string; profiles: NewsNameProfile[] }[] = [];
  for (const company of companies) {
    const ticker = normalizeTicker(company.ticker);
    if (!ticker) continue;
    tickerSet.add(ticker);
    const names = [company.name, ...(company.aliases ?? [])];
    profiles.push({
      ticker,
      profiles: names.map((name) => buildNewsProfiles(name)),
    });
  }

  function findMentionedTickers(text: string): string[] {
    const found = new Set<string>();
    for (const match of text.matchAll(/\$([A-Za-z]{1,5})\b/g)) {
      const ticker = normalizeTicker(match[1]);
      if (ticker && tickerSet.has(ticker)) found.add(ticker);
    }
    for (const match of text.matchAll(/\(([A-Za-z]{1,5})\)/g)) {
      const ticker = normalizeTicker(match[1]);
      if (ticker && tickerSet.has(ticker)) found.add(ticker);
    }
    for (const word of text.split(/[^A-Za-z0-9]+/)) {
      if (!word) continue;
      const ticker = normalizeTicker(word);
      if (!ticker || !tickerSet.has(ticker) || ticker.length < 3 || BARE_TICKER_STOP.has(ticker)) continue;
      found.add(ticker);
    }
    return [...found];
  }

  function findLegacyNameTickers(text: string): Set<string> {
    const hits = new Set<string>();
    for (const company of companies) {
      const ticker = normalizeTicker(company.ticker);
      if (!ticker) continue;
      const names = [company.name, ...(company.aliases ?? [])];
      if (names.some((name) => legacyTextHasName(text, name))) hits.add(ticker);
    }
    return hits;
  }

  function findNewsNameTickers(title: string): Set<string> {
    const hits = new Set<string>();
    const titlePhrase = normalizePhrase(title);
    const titleTokens = new Set(tokenize(title));
    for (const row of profiles) {
      if (row.profiles.some((profile) => newsProfileMatches(titlePhrase, titleTokens, profile))) {
        hits.add(row.ticker);
      }
    }
    return hits;
  }

  return { companies, findMentionedTickers, findLegacyNameTickers, findNewsNameTickers };
}
