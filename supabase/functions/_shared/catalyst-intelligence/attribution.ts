import type { CompanyRecord, NormalizedEventCandidate, TickerRelation } from "./types.ts";
import { normalizeTicker } from "./normalize.ts";

export interface AttributionDecision {
  status: "resolved" | "unresolved";
  ticker: string | null;
  relation: TickerRelation | null;
  confidence: number;
  note: string;
}

export interface AttributionContext {
  sourceTicker: string | null;
  sourceCompanyName: string | null;
  sourceCik: string | null;
  sourceType: string;
  cikMap?: ReadonlyMap<string, string[]>;
  companies?: readonly CompanyRecord[];
}

function companyTokens(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((t) => t.length >= 3);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textHasName(text: string, name: string): boolean {
  const tokens = companyTokens(name);
  if (tokens.length === 0) return false;
  const phrase = tokens.join(" ");
  if (phrase.length < 4) return false;
  const pattern = tokens.map(escapeRegExp).join("\\s+");
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?:$|[^a-z0-9])`, "i").test(text);
}

const BARE_TICKER_STOP = new Set([
  "ALL", "FOR", "THE", "AND", "CAN", "NOW", "NEW", "SEE", "LOW", "BIG",
  "OUT", "ONE", "ANY", "HAS", "NOT", "BUT", "YOU", "OUR", "DAY", "MAY",
  "ARE", "WAS", "HIS", "HER", "WHO", "HOW", "WHY", "TOO", "OLD", "HOT", "TOP",
]);

function mentionedTickers(text: string, companies: readonly CompanyRecord[]): string[] {
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
  const text = `${candidate.title}\n${candidate.summary ?? ""}`;
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
      return { status: "unresolved", ticker: null, relation: null, confidence: 0.2, note: "ambiguous_cik" };
    }
  }

  const metaTicker = normalizeTicker(candidate.metadata.ticker);
  if (metaTicker) {
    return {
      status: "resolved",
      ticker: metaTicker,
      relation: "PRIMARY",
      confidence: 0.9,
      note: "exact_ticker_metadata",
    };
  }

  const companies = ctx.companies ?? [];
  const nameHits = new Set<string>();
  for (const company of companies) {
    const ticker = normalizeTicker(company.ticker);
    if (!ticker) continue;
    const names = [company.name, ...(company.aliases ?? [])];
    if (names.some((name) => textHasName(text, name))) nameHits.add(ticker);
  }
  if (nameHits.size === 1) {
    return {
      status: "resolved",
      ticker: [...nameHits][0],
      relation: "PRIMARY",
      confidence: 0.72,
      note: "alias_match",
    };
  }
  if (nameHits.size > 1) {
    return { status: "unresolved", ticker: null, relation: null, confidence: 0.15, note: "ambiguous_alias" };
  }

  const mentions = mentionedTickers(text, companies);
  if (mentions.length === 1) {
    return {
      status: "resolved",
      ticker: mentions[0],
      relation: "MENTION",
      confidence: 0.55,
      note: "ticker_mention",
    };
  }
  if (mentions.length > 1) {
    return { status: "unresolved", ticker: null, relation: null, confidence: 0.1, note: "ambiguous_mention" };
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

  return { status: "unresolved", ticker: null, relation: null, confidence: 0, note: "no_attribution" };
}
