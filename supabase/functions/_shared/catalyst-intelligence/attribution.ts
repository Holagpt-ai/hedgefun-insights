import type { AttributionIndex } from "./attribution-index.ts";

import { buildAttributionIndex, legacyTextHasName } from "./attribution-index.ts";

import type { UnresolvedAttributionReason } from "./attribution-reasons.ts";

import type { CompanyRecord, NormalizedEventCandidate, TickerRelation } from "./types.ts";

import { normalizeTicker } from "./normalize.ts";



export interface AttributionDecision {

  status: "resolved" | "unresolved";

  ticker: string | null;

  relation: TickerRelation | null;

  confidence: number;

  note: string;

  unresolvedReason?: UnresolvedAttributionReason;

  /** Safe attribution diagnostics. Short codes and phrases only. */
  trace?: AttributionTrace;

}

export interface AttributionTrace {
  method: string;
  matchBasis: "company_phrase" | "explicit_ticker" | "provider_metadata" | "source_ticker" | "cik" | "none";
  matchedPhrase?: string | null;
  tickerPattern?: "cashtag" | "parentheses" | "exchange_qualified" | null;
  provider?: string | null;
}



export interface AttributionContext {

  sourceTicker: string | null;

  sourceCompanyName: string | null;

  sourceCik: string | null;

  sourceType: string;

  cikMap?: ReadonlyMap<string, string[]>;

  companies?: readonly CompanyRecord[];

  attributionIndex?: AttributionIndex;

}



function companyTokens(name: string): string[] {

  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((t) => t.length >= 3);

}



function escapeRegExp(value: string): string {

  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

}



function textHasName(text: string, name: string): boolean {

  return legacyTextHasName(text, name);

}



function resolveIndex(ctx: AttributionContext): AttributionIndex | null {

  if (ctx.attributionIndex) return ctx.attributionIndex;

  if (ctx.companies && ctx.companies.length > 0) return buildAttributionIndex(ctx.companies);

  return null;

}



/**

 * Attribution order:

 * 1. direct source/company mapping

 * 2. SEC CIK map

 * 3. exact ticker on the item

 * 4. unique company-name/alias match

 * 5. explicit cashtag/ticker mention

 * Ambiguous matches stay unresolved. Supplier/customer links are not inferred.

 */

export function attributeCandidate(

  candidate: NormalizedEventCandidate,

  ctx: AttributionContext,

): AttributionDecision {

  const fullText = `${candidate.title}\n${candidate.summary ?? ""}`;

  const index = resolveIndex(ctx);

  const sourceTicker = normalizeTicker(ctx.sourceTicker);

  if (sourceTicker && (ctx.sourceType === "COMPANY_IR" || ctx.sourceType === "COMPANY_EVENTS")) {

    return {

      status: "resolved",

      ticker: sourceTicker,

      relation: "DIRECT",

      confidence: 0.97,

      note: "direct_source_mapping",

    };

  }



  const cik = typeof candidate.metadata.cik === "string"

    ? candidate.metadata.cik

    : ctx.sourceCik;

  if (cik && ctx.cikMap) {

    const mapped = (ctx.cikMap.get(cik) ?? []).map((t) => normalizeTicker(t)).filter((t): t is string => !!t);

    const unique = [...new Set(mapped)];

    if (unique.length === 1) {

      return {

        status: "resolved",

        ticker: unique[0],

        relation: "PRIMARY",

        confidence: 0.95,

        note: "cik_mapping",

      };

    }

    if (unique.length > 1) {

      return {

        status: "unresolved",

        ticker: null,

        relation: null,

        confidence: 0.2,

        note: "ambiguous_cik",

        unresolvedReason: "MULTIPLE_CIK_TICKERS",

      };

    }

    if (unique.length === 0) {

      return {

        status: "unresolved",

        ticker: null,

        relation: null,

        confidence: 0,

        note: "cik_unmapped",

        unresolvedReason: "NO_CIK_TICKER_MAPPING",

      };

    }

  }



  if (ctx.sourceType === "NEWS_PR" && candidate.metadata.provider_ticker_conflict === true) {
    return {
      status: "unresolved",
      ticker: null,
      relation: null,
      confidence: 0,
      note: "provider_ticker_conflict",
      unresolvedReason: "PROVIDER_TICKER_CONFLICT",
      trace: {
        method: "provider_structured_ticker",
        matchBasis: "provider_metadata",
        provider: "globenewswire_stock_category",
      },
    };
  }

  const metaTicker = normalizeTicker(candidate.metadata.ticker);

  if (metaTicker) {
    const providerStructured = candidate.metadata.attribution_provider === "globenewswire_stock_category";
    return {
      status: "resolved",
      ticker: metaTicker,
      relation: "PRIMARY",
      confidence: 0.9,
      note: providerStructured ? "provider_structured_ticker" : "exact_ticker_metadata",
      trace: providerStructured
        ? {
          method: "provider_structured_ticker",
          matchBasis: "provider_metadata",
          tickerPattern: "exchange_qualified",
          provider: "globenewswire_stock_category",
        }
        : { method: "exact_ticker_metadata", matchBasis: "provider_metadata" },
    };
  }



  const companies = ctx.companies ?? index?.companies ?? [];
  const newsIndex = ctx.sourceType === "NEWS_PR" ? (index ?? buildAttributionIndex(companies)) : null;

  if (ctx.sourceType === "NEWS_PR" && newsIndex) {
    const explicit = newsIndex.findNewsExplicitTickers(fullText);
    if (explicit.length === 1) {
      return {
        status: "resolved",
        ticker: explicit[0],
        relation: "MENTION",
        confidence: 0.55,
        note: "news_explicit_ticker",
        trace: {
          method: "news_explicit_ticker",
          matchBasis: "explicit_ticker",
          tickerPattern: newsIndex.lastNewsExplicitPattern,
        },
      };
    }
    if (explicit.length > 1) {
      return {
        status: "unresolved",
        ticker: null,
        relation: null,
        confidence: 0.1,
        note: "ambiguous_mention",
        unresolvedReason: "AMBIGUOUS_TICKER_MENTION",
      };
    }
  }

  const nameHits = new Set<string>();

  if (ctx.sourceType === "NEWS_PR") {

    const newsHits = (newsIndex ?? findNewsNameIndex(candidate.title, companies)).findNewsNameTickers(candidate.title);

    for (const ticker of newsHits) nameHits.add(ticker);

  } else if (index) {

    for (const ticker of index.findLegacyNameTickers(fullText)) nameHits.add(ticker);

  } else {

    for (const company of companies) {

      const ticker = normalizeTicker(company.ticker);

      if (!ticker) continue;

      const names = [company.name, ...(company.aliases ?? [])];

      if (names.some((name) => textHasName(fullText, name))) nameHits.add(ticker);

    }

  }

  if (nameHits.size === 1) {

    const note = ctx.sourceType === "NEWS_PR" ? "news_name_match" : "alias_match";
    const ticker = [...nameHits][0];
    const matchedPhrase = ctx.sourceType === "NEWS_PR"
      ? (newsIndex ?? findNewsNameIndex(candidate.title, companies)).lastNewsAcceptedPhrase(ticker)
      : null;

    return {

      status: "resolved",

      ticker,

      relation: "PRIMARY",

      confidence: ctx.sourceType === "NEWS_PR" ? 0.85 : 0.72,

      note,

      trace: ctx.sourceType === "NEWS_PR"
        ? { method: "news_name_match", matchBasis: "company_phrase", matchedPhrase }
        : { method: "alias_match", matchBasis: "company_phrase", matchedPhrase },

    };

  }

  if (nameHits.size > 1) {

    return {

      status: "unresolved",

      ticker: null,

      relation: null,

      confidence: 0.15,

      note: "ambiguous_alias",

      unresolvedReason: "AMBIGUOUS_COMPANY_ALIAS",

    };

  }



  const mentions = ctx.sourceType === "NEWS_PR"
    ? []
    : (index
      ? index.findMentionedTickers(fullText)
      : mentionedTickersLegacy(fullText, companies));

  if (mentions.length === 1) {

    return {

      status: "resolved",

      ticker: mentions[0],

      relation: "MENTION",

      confidence: 0.55,

      note: ctx.sourceType === "NEWS_PR" ? "news_explicit_ticker" : "ticker_mention",

    };

  }

  if (mentions.length > 1) {

    return {

      status: "unresolved",

      ticker: null,

      relation: null,

      confidence: 0.1,

      note: "ambiguous_mention",

      unresolvedReason: "AMBIGUOUS_TICKER_MENTION",

    };

  }



  if (sourceTicker && ctx.sourceType === "NEWS_PR") {

    return {

      status: "resolved",

      ticker: sourceTicker,

      relation: "SECONDARY",

      confidence: 0.6,

      note: "source_ticker_hint",

    };

  }



  return {

    status: "unresolved",

    ticker: null,

    relation: null,

    confidence: 0,

    note: "no_attribution",

    unresolvedReason: "NO_ATTRIBUTION",

  };

}



function findNewsNameIndex(title: string, companies: readonly CompanyRecord[]): AttributionIndex {
  const built = buildAttributionIndex(companies);
  built.findNewsNameTickers(title);
  return built;
}



const BARE_TICKER_STOP = new Set([

  "ALL", "FOR", "THE", "AND", "CAN", "NOW", "NEW", "SEE", "LOW", "BIG",

  "OUT", "ONE", "ANY", "HAS", "NOT", "BUT", "YOU", "OUR", "DAY", "MAY",

  "ARE", "WAS", "HIS", "HER", "WHO", "HOW", "WHY", "TOO", "OLD", "HOT", "TOP",

]);



function mentionedTickersLegacy(text: string, companies: readonly CompanyRecord[]): string[] {

  const universe = new Set(

    companies.map((company) => normalizeTicker(company.ticker)).filter((ticker): ticker is string => !!ticker),

  );

  const found = new Set<string>();

  for (const ticker of universe) {

    if (new RegExp(`\\$${ticker}\\b|\\(${ticker}\\)`, "i").test(text)) found.add(ticker);

    if (ticker.length < 3 || BARE_TICKER_STOP.has(ticker)) continue;

    if (new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(ticker)}(?:$|[^A-Za-z0-9])`).test(text)) found.add(ticker);

  }

  return [...found];

}


