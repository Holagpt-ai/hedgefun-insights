/**
 * Strict catalyst-to-ticker attribution.
 * A company merely mentioned in an article is not automatically the subject.
 */

export type AttributionClass =
  | "direct"
  | "provider_associated"
  | "sector_related"
  | "unverified";

export const TICKER_REGEX = /^[A-Z][A-Z0-9.-]{0,14}$/;

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  return TICKER_REGEX.test(t) ? t : null;
}

export function normalizeHeadline(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function canonicalUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    u.hash = "";
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    u.pathname = path;
    return u.toString();
  } catch {
    return null;
  }
}

const LEGAL_SUFFIXES = /\b(incorporated|corporation|company|companies|holdings?|group|limited|ltd|llc|inc|corp|plc|co|nv|sa|ag)\b/gi;

export function companyNameTokens(companyName: string | null | undefined): string[] {
  if (!companyName || typeof companyName !== "string") return [];
  const stripped = companyName.replace(LEGAL_SUFFIXES, " ").replace(/[.,()]/g, " ").replace(/\s+/g, " ").trim();
  if (!stripped) return [];
  const tokens = stripped.split(" ").filter((t) => t.length >= 4);
  const out = new Set<string>();
  if (stripped.length >= 4) out.add(stripped.toLowerCase());
  for (const t of tokens) out.add(t.toLowerCase());
  // First two tokens as a phrase ("nuscale power", "micron technology").
  if (tokens.length >= 2) out.add(`${tokens[0]} ${tokens[1]}`.toLowerCase());
  return [...out];
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function titleMentionsTicker(title: string, ticker: string): boolean {
  const t = normalizeSymbol(ticker);
  if (!t) return false;
  const text = title;
  const patterns = [
    new RegExp(`\\$${escapeRe(t)}\\b`, "i"),
    new RegExp(`\\(${escapeRe(t)}\\)`, "i"),
    new RegExp(`(?:^|[\\s,;:/|-])${escapeRe(t)}(?:$|[\\s,;:/|.-])`, "i"),
    new RegExp(`\\b${escapeRe(t)}:\\s`, "i"),
  ];
  return patterns.some((p) => p.test(text));
}

export function titleMentionsCompany(title: string, companyName: string | null | undefined): boolean {
  const tokens = companyNameTokens(companyName);
  if (tokens.length === 0) return false;
  const hay = title.toLowerCase();
  for (const token of tokens.sort((a, b) => b.length - a.length)) {
    if (token.length < 4) continue;
    const re = new RegExp(`\\b${escapeRe(token)}\\b`, "i");
    if (re.test(hay)) return true;
  }
  return false;
}

const GENERIC_LEAD =
  /^(company|shares|stock|stocks|investors?|analysts?|report|source|update|breaking|exclusive|markets?|today|why|how|what|after|before|the)\b/i;

function leadingEntity(title: string): string | null {
  const m = title.trim().match(/^([A-Z][A-Za-z0-9.&'-]{3,}(?:\s+[A-Z][A-Za-z0-9.&'-]{3,})?)/);
  if (!m) return null;
  if (GENERIC_LEAD.test(m[1])) return null;
  return m[1];
}

const SECTOR_PATTERNS: RegExp[] = [
  /\b(?:semiconductor|chipmaker|chipmakers|ev makers?|auto(?:motive)? stocks?|nuclear(?: energy)? stocks?|small[- ]caps?|mega[- ]caps?|financials|banks|biotech(?:nology)? stocks?|energy stocks?|tech stocks?|ais stocks?|ai stocks?)\b/i,
  /\bstocks?\s+to\s+watch\b/i,
  /\bthese\s+\d+\s+stocks?\b/i,
  /\b(?:sector|industry|peer(?:s| group)?)\b/i,
  /\b(?:among|including)\s+[A-Z]{1}[\w.-]+(?:\s*,\s*[A-Z]{1}[\w.-]+){2,}/,
  /\b(?:gainers?|losers?|movers?)\b/i,
];

export function looksLikeSectorOrRoundup(title: string, tickerCount: number): boolean {
  if (tickerCount >= 4) return true;
  return SECTOR_PATTERNS.some((p) => p.test(title));
}

export interface AttributionInput {
  title: string;
  description?: string | null;
  symbol: string;
  companyName?: string | null;
  providerTickers: string[];
  providerAssociatesSymbol?: boolean;
}

export interface AttributionResult {
  class: AttributionClass;
  reason: string;
  symbol: string;
  ticker_specific: boolean;
}

export function isTickerSpecificCatalyst(a: AttributionResult): boolean {
  return a.ticker_specific;
}

function uniqueTickers(raw: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const s = normalizeSymbol(r);
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * Attribute one candidate symbol against a story.
 * `direct` requires the company/ticker to be the primary subject.
 * `provider_associated` is only "sufficiently reliable" when the provider list
 * is small and no competing primary subject exists.
 */
export function attributeSymbol(input: AttributionInput): AttributionResult {
  const symbol = normalizeSymbol(input.symbol);
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const providers = uniqueTickers(input.providerTickers);
  if (!symbol || !title) {
    return {
      class: "unverified",
      reason: "missing_title_or_symbol",
      symbol: symbol ?? "",
      ticker_specific: false,
    };
  }

  const associated =
    input.providerAssociatesSymbol === true || providers.includes(symbol);
  const inTitleTicker = titleMentionsTicker(title, symbol);
  const inTitleName = titleMentionsCompany(title, input.companyName ?? null);
  const strongSelf = inTitleTicker || inTitleName;

  const competing = providers.filter((t) => t !== symbol);
  const sector = looksLikeSectorOrRoundup(title, providers.length);

  if (strongSelf && !sector) {
    return {
      class: "direct",
      reason: inTitleTicker ? "title_ticker_primary" : "title_entity_primary",
      symbol,
      ticker_specific: true,
    };
  }

  if (strongSelf && sector && providers.length <= 2) {
    return {
      class: "direct",
      reason: "title_entity_in_narrow_group",
      symbol,
      ticker_specific: true,
    };
  }

  if (sector && !strongSelf) {
    return {
      class: associated ? "sector_related" : "unverified",
      reason: associated ? "sector_or_roundup_without_primary" : "sector_unassociated",
      symbol,
      ticker_specific: false,
    };
  }

  if (associated && providers.length === 1 && !sector) {
    const lead = leadingEntity(title);
    const tokens = companyNameTokens(input.companyName ?? null);
    const leadIsSelf =
      !!lead &&
      tokens.some(
        (t) => lead.toLowerCase().includes(t) || t.includes(lead.toLowerCase()),
      );
    if (lead && !leadIsSelf) {
      return {
        class: "unverified",
        reason: "title_subject_is_other_entity",
        symbol,
        ticker_specific: false,
      };
    }
    return {
      class: "provider_associated",
      reason: "single_provider_association",
      symbol,
      ticker_specific: true,
    };
  }

  if (associated && competing.length > 0 && !strongSelf) {
    return {
      class: "unverified",
      reason: "mentioned_among_other_provider_tickers",
      symbol,
      ticker_specific: false,
    };
  }

  if (associated) {
    return {
      class: "unverified",
      reason: "provider_mention_insufficient",
      symbol,
      ticker_specific: false,
    };
  }

  return {
    class: "unverified",
    reason: "insufficient_evidence",
    symbol,
    ticker_specific: false,
  };
}

export interface StoryTickerInput {
  title: string;
  description?: string | null;
  tickers: Array<{ symbol: string; companyName?: string | null }>;
  providerArticleId?: string | null;
  sourceUrl?: string | null;
}

export function attributeStory(story: StoryTickerInput): AttributionResult[] {
  const providers = uniqueTickers(story.tickers.map((t) => t.symbol));
  return story.tickers.map((t) =>
    attributeSymbol({
      title: story.title,
      description: story.description,
      symbol: t.symbol,
      companyName: t.companyName ?? null,
      providerTickers: providers,
      providerAssociatesSymbol: true,
    }),
  );
}

export interface DedupeableStory {
  id?: unknown;
  dedupe_key?: unknown;
  source_url?: unknown;
  title?: unknown;
  provider_article_id?: unknown;
}

export function storyDedupeKeys(row: DedupeableStory): string[] {
  const keys: string[] = [];
  const articleId = typeof row.provider_article_id === "string" ? row.provider_article_id.trim() : "";
  if (articleId) keys.push(`article:${articleId}`);
  const url = canonicalUrl(row.source_url);
  if (url) keys.push(`url:${url}`);
  const headline = normalizeHeadline(row.title);
  if (headline) keys.push(`headline:${headline}`);
  const key = typeof row.dedupe_key === "string" ? row.dedupe_key.trim() : "";
  if (key) keys.push(`key:${key}`);
  const id = typeof row.id === "string" ? row.id : row.id != null ? String(row.id) : "";
  if (id) keys.push(`id:${id}`);
  return keys;
}

export function storyDedupeKey(row: DedupeableStory): string | null {
  return storyDedupeKeys(row)[0] ?? null;
}

export function dedupeStories<T extends DedupeableStory>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const keys = storyDedupeKeys(r);
    if (keys.length === 0) continue;
    if (keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    out.push(r);
  }
  return out;
}

export const NO_VERIFIED_CATALYST = "No verified ticker-specific catalyst available.";
