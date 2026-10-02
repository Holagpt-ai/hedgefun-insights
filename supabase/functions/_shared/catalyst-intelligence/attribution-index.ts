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
  return ` ${haystack} `.includes(` ${needle} `);
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

/** Supported exchange-qualified ticker syntax for NEWS_PR (deterministic, no fuzzy parsing). */
const EXCHANGE_QUALIFIED_TICKER = /(?:NASDAQ|NYSE(?:\s+American)?)\s*:\s*([A-Za-z]{1,5})\b/gi;

function findExplicitTickersInText(text: string, tickerSet: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\$([A-Za-z]{1,5})\b/g)) {
    const ticker = normalizeTicker(match[1]);
    if (ticker && tickerSet.has(ticker)) found.add(ticker);
  }
  for (const match of text.matchAll(/\(([A-Za-z]{1,5})\)/g)) {
    const ticker = normalizeTicker(match[1]);
    if (ticker && tickerSet.has(ticker)) found.add(ticker);
  }
  for (const match of text.matchAll(EXCHANGE_QUALIFIED_TICKER)) {
    const ticker = normalizeTicker(match[1]);
    if (ticker && tickerSet.has(ticker)) found.add(ticker);
  }
  return [...found];
}

export interface AttributionIndex {
  readonly companies: readonly CompanyRecord[];
  /** Candidates examined by the last NEWS name lookup. Not a full-universe scan. */
  lastNewsCandidateCount: number;
  /** SEC/IR and legacy paths: cashtag, parens, and bare ticker words (with stop list). */
  findMentionedTickers(text: string): string[];
  /** NEWS_PR only: cashtag, parens, and exchange-qualified tickers — no bare words. */
  findNewsExplicitTickers(text: string): string[];
  findLegacyNameTickers(text: string): Set<string>;
  findNewsNameTickers(title: string): Set<string>;
}

function addPosting(map: Map<string, string[]>, key: string, ticker: string): void {
  const current = map.get(key);
  if (!current) {
    map.set(key, [ticker]);
    return;
  }
  if (!current.includes(ticker)) current.push(ticker);
}

export function buildAttributionIndex(companies: readonly CompanyRecord[]): AttributionIndex {
  const tickerSet = new Set<string>();
  const exactPhrases = new Map<string, string[]>();
  const tokenPostings = new Map<string, string[]>();
  const profilesByTicker = new Map<string, NewsNameProfile[]>();
  let lastNewsCandidateCount = 0;
  for (const company of companies) {
    const ticker = normalizeTicker(company.ticker);
    if (!ticker) continue;
    tickerSet.add(ticker);
    const names = [company.name, ...(company.aliases ?? [])];
    const profiles = names.map((name) => buildNewsProfiles(name));
    profilesByTicker.set(ticker, profiles);
    for (const profile of profiles) {
      if (profile.exactPhrase.length >= 4) addPosting(exactPhrases, profile.exactPhrase, ticker);
      for (const token of profile.meaningful) {
        if (token.length >= 4) addPosting(tokenPostings, token, ticker);
      }
    }
  }

  function findNewsExplicitTickers(text: string): string[] {
    return findExplicitTickersInText(text, tickerSet);
  }

  function findMentionedTickers(text: string): string[] {
    const found = new Set(findExplicitTickersInText(text, tickerSet));
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
    const rawTokens = tokenize(title);
    const titleTokens = new Set(rawTokens);
    const windows = new Set<string>();
    const maxWindow = Math.min(8, rawTokens.length);
    for (let size = maxWindow; size >= 1; size -= 1) {
      for (let i = 0; i + size <= rawTokens.length; i += 1) {
        const window = rawTokens.slice(i, i + size).join(" ");
        if (window.length < 4 || windows.has(window)) continue;
        windows.add(window);
        const owners = exactPhrases.get(window);
        if (!owners) continue;
        for (const ticker of owners) hits.add(ticker);
      }
    }
    if (hits.size > 0) {
      lastNewsCandidateCount = hits.size;
      return hits;
    }
    const meaningful = meaningfulNameTokens(title).filter((token) => token.length >= 4);
    let rarest: string[] | null = null;
    for (const token of meaningful) {
      const posting = tokenPostings.get(token);
      if (!posting || posting.length === 0) continue;
      if (!rarest || posting.length < rarest.length) rarest = posting;
    }
    if (!rarest) {
      lastNewsCandidateCount = 0;
      return hits;
    }
    lastNewsCandidateCount = rarest.length;
    for (const ticker of rarest) {
      const profiles = profilesByTicker.get(ticker) ?? [];
      if (profiles.some((profile) => newsProfileMatches(titlePhrase, titleTokens, profile))) hits.add(ticker);
    }
    return hits;
  }

  return {
    companies,
    get lastNewsCandidateCount() {
      return lastNewsCandidateCount;
    },
    findMentionedTickers,
    findNewsExplicitTickers,
    findLegacyNameTickers,
    findNewsNameTickers,
  };
}
