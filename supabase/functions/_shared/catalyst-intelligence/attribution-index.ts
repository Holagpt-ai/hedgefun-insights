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

const TRAILING_IDENTITY_SUFFIXES = new Set([
  "corp", "corporation", "inc", "incorporated", "llc", "plc", "ltd", "limited",
  "co", "lp", "nv", "sa", "llp", "company", "holdings",
]);

/** Tokens that may follow an identity phrase without extending it. */
const IDENTITY_FOLLOW_OK = new Set([
  "announces", "announce", "announced", "reports", "report", "reported", "results",
  "updates", "update", "updated", "will", "to", "and", "has", "have", "names", "named",
  "appoints", "appointed", "launches", "files", "declares", "sets", "hosts", "today",
  "earnings", "dividend", "preliminary", "provides", "provided", "fiscal", "full",
  "inc", "corp", "corporation", "llc", "plc", "ltd", "co", "sa", "nv", "holdings",
  "group", "limited", "n", "v",
]);

interface NewsNameProfile {
  phrases: string[][];
}

/** Identity phrases keep brand words such as a leading "The". Suffixes may drop. */
export function newsIdentityPhrases(name: string): string[][] {
  const tokens = tokenize(name);
  if (tokens.length === 0) return [];
  const phrases: string[][] = [];
  const push = (parts: string[]) => {
    const phrase = parts.join(" ");
    if (phrase.length < 4) return;
    if (phrases.some((existing) => existing.join(" ") === phrase)) return;
    phrases.push(parts);
  };
  push(tokens);
  let core = tokens.slice();
  while (core.length > 1 && TRAILING_IDENTITY_SUFFIXES.has(core[core.length - 1])) {
    core = core.slice(0, -1);
  }
  push(core);
  return phrases;
}

function phraseStarts(titleTokens: string[], phrase: string[]): number[] {
  const starts: number[] = [];
  for (let i = 0; i + phrase.length <= titleTokens.length; i += 1) {
    let matched = true;
    for (let j = 0; j < phrase.length; j += 1) {
      if (titleTokens[i + j] !== phrase[j]) {
        matched = false;
        break;
      }
    }
    if (matched) starts.push(i);
  }
  return starts;
}

export interface NewsIdentityMatch {
  phrase: string;
  /** A single-token identity later in the headline can create ambiguity, but cannot attribute alone. */
  attributable: boolean;
}

/**
 * Acceptance is separate from candidate generation.
 * A leading "The" plus one brand word does not match a longer collocation such as "the joint venture".
 */
export function acceptNewsIdentity(titleTokens: string[], phrases: string[][]): NewsIdentityMatch | null {
  let laterSingle: string | null = null;
  for (const phrase of phrases) {
    for (const start of phraseStarts(titleTokens, phrase)) {
      const next = titleTokens[start + phrase.length];
      if (
        phrase.length === 2 &&
        phrase[0] === "the" &&
        next &&
        !IDENTITY_FOLLOW_OK.has(next) &&
        !TRAILING_IDENTITY_SUFFIXES.has(next)
      ) {
        continue;
      }
      if (phrase.length === 1) {
        if (phrase[0].length < 5) continue;
        if (start === 0) return { phrase: phrase.join(" "), attributable: true };
        laterSingle = phrase.join(" ");
        continue;
      }
      return { phrase: phrase.join(" "), attributable: true };
    }
  }
  if (laterSingle) return { phrase: laterSingle, attributable: false };
  return null;
}

function buildNewsProfiles(name: string): NewsNameProfile {
  return { phrases: newsIdentityPhrases(name) };
}

/** Supported exchange-qualified ticker syntax for NEWS_PR (deterministic, no fuzzy parsing). */
const EXCHANGE_QUALIFIED_TICKER = /(?:NASDAQ|NYSE(?:\s+American)?)\s*:\s*([A-Za-z]{1,5})\b/gi;

export type ExplicitTickerPattern = "cashtag" | "parentheses" | "exchange_qualified";

function findExplicitTickerMatches(
  text: string,
  tickerSet: ReadonlySet<string>,
): { ticker: string; pattern: ExplicitTickerPattern }[] {
  const found: { ticker: string; pattern: ExplicitTickerPattern }[] = [];
  const seen = new Set<string>();
  const add = (raw: string | undefined, pattern: ExplicitTickerPattern) => {
    const ticker = normalizeTicker(raw);
    if (!ticker || !tickerSet.has(ticker) || seen.has(`${pattern}:${ticker}`)) return;
    seen.add(`${pattern}:${ticker}`);
    found.push({ ticker, pattern });
  };
  for (const match of text.matchAll(/\$([A-Za-z]{1,5})\b/g)) add(match[1], "cashtag");
  for (const match of text.matchAll(/\(([A-Za-z]{1,5})\)/g)) add(match[1], "parentheses");
  for (const match of text.matchAll(EXCHANGE_QUALIFIED_TICKER)) add(match[1], "exchange_qualified");
  return found;
}

function findExplicitTickersInText(text: string, tickerSet: ReadonlySet<string>): string[] {
  return [...new Set(findExplicitTickerMatches(text, tickerSet).map((hit) => hit.ticker))];
}

export interface AttributionIndex {
  readonly companies: readonly CompanyRecord[];
  /** Candidates examined by the last NEWS name lookup. Not a full-universe scan. */
  lastNewsCandidateCount: number;
  /** SEC/IR and legacy paths: cashtag, parens, and bare ticker words (with stop list). */
  findMentionedTickers(text: string): string[];
  /** NEWS_PR only: cashtag, parens, and exchange-qualified tickers — no bare words. */
  findNewsExplicitTickers(text: string): string[];
  /** Pattern that produced the last unique NEWS explicit ticker, if any. */
  readonly lastNewsExplicitPattern: ExplicitTickerPattern | null;
  /** Accepted company phrase for a ticker from the last NEWS name lookup. */
  lastNewsAcceptedPhrase(ticker: string): string | null;
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
  let lastNewsExplicitPattern: ExplicitTickerPattern | null = null;
  let acceptedPhrases: Record<string, string> = {};
  for (const company of companies) {
    const ticker = normalizeTicker(company.ticker);
    if (!ticker) continue;
    tickerSet.add(ticker);
    const names = [company.name, ...(company.aliases ?? [])];
    const profiles = names.map((name) => buildNewsProfiles(name));
    profilesByTicker.set(ticker, profiles);
    for (const profile of profiles) {
      for (const phrase of profile.phrases) {
        const key = phrase.join(" ");
        if (key.length >= 4) addPosting(exactPhrases, key, ticker);
      }
    }
    for (const name of names) {
      for (const token of meaningfulNameTokens(name)) {
        if (token.length >= 4) addPosting(tokenPostings, token, ticker);
      }
    }
  }

  function findNewsExplicitTickers(text: string): string[] {
    const matches = findExplicitTickerMatches(text, tickerSet);
    const unique = [...new Set(matches.map((hit) => hit.ticker))];
    lastNewsExplicitPattern = unique.length === 1
      ? matches.find((hit) => hit.ticker === unique[0])?.pattern ?? null
      : null;
    return unique;
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
    acceptedPhrases = {};
    const titleTokens = tokenize(title);
    const candidates = new Set<string>();
    const windows = new Set<string>();
    const maxWindow = Math.min(8, titleTokens.length);
    for (let size = maxWindow; size >= 1; size -= 1) {
      for (let i = 0; i + size <= titleTokens.length; i += 1) {
        const window = titleTokens.slice(i, i + size).join(" ");
        if (window.length < 4 || windows.has(window)) continue;
        windows.add(window);
        const owners = exactPhrases.get(window);
        if (!owners) continue;
        for (const ticker of owners) candidates.add(ticker);
      }
    }
    const meaningful = meaningfulNameTokens(title).filter((token) => token.length >= 4);
    let rarest: string[] | null = null;
    for (const token of meaningful) {
      const posting = tokenPostings.get(token);
      if (!posting || posting.length === 0) continue;
      if (!rarest || posting.length < rarest.length) rarest = posting;
    }
    if (rarest) {
      for (const ticker of rarest) candidates.add(ticker);
    }
    lastNewsCandidateCount = candidates.size;
    const attributable = new Set<string>();
    const laterOnly = new Set<string>();
    for (const ticker of candidates) {
      const profiles = profilesByTicker.get(ticker) ?? [];
      for (const profile of profiles) {
        const match = acceptNewsIdentity(titleTokens, profile.phrases);
        if (!match) continue;
        acceptedPhrases[ticker] = match.phrase;
        if (match.attributable) attributable.add(ticker);
        else laterOnly.add(ticker);
        break;
      }
    }
    if (attributable.size === 1 && laterOnly.size === 0) {
      hits.add([...attributable][0]);
    } else if (attributable.size + laterOnly.size > 1) {
      for (const ticker of attributable) hits.add(ticker);
      for (const ticker of laterOnly) hits.add(ticker);
    }
    return hits;
  }

  return {
    companies,
    get lastNewsCandidateCount() {
      return lastNewsCandidateCount;
    },
    get lastNewsExplicitPattern() {
      return lastNewsExplicitPattern;
    },
    lastNewsAcceptedPhrase(ticker: string) {
      return acceptedPhrases[ticker] ?? null;
    },
    findMentionedTickers,
    findNewsExplicitTickers,
    findLegacyNameTickers,
    findNewsNameTickers,
  };
}
