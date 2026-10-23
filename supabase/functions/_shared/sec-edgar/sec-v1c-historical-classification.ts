/**
 * Read-only classification for pre–Attribution Integrity V1 SEC catalyst rows.
 * Replays `resolveSecFilingAttribution` using stored facts + current CIK map.
 */

import {
  resolveSecFilingAttribution,
  type SecFilingAttributionReason,
} from "./sec-filing-attribution.ts";

export type CikTickerListing = { ticker: string; exchange: string | null };
export type CikTickerMap = Map<string, CikTickerListing[]>;

type SecFeedEntry = {
  form_type: string;
  cik: string;
  accession_number: string;
  company_name: string | null;
  filing_date: string | null;
  accepted_at: string | null;
  filing_url: string | null;
  primary_document: string | null;
  sec_items: string[] | null;
};

export const SEC_V1C_REMEDIATION_POLICY_VERSION = "sec-v1c-attribution-remediation-v1";

export type SecHistoricalClassification =
  | "confirmed_misattribution"
  | "legitimate"
  | "unresolved";

export type SecHistoricalRowInput = {
  dedupe_key: string;
  symbol: string;
  company_name: string | null;
  provider: string;
  provider_article_id: string | null;
  verification_state: string;
  facts: Record<string, unknown>;
};

export type SecHistoricalClassificationResult = {
  dedupe_key: string;
  symbol: string;
  classification: SecHistoricalClassification;
  reason_code: string;
  resolver_reason: SecFilingAttributionReason | null;
  form_type: string | null;
  cik: string | null;
  accession_number: string | null;
  cik_listing_count: number;
  resolver_target_tickers: string[];
};

export function parseSecV1cDedupeKey(
  dedupeKey: string,
): { accession: string; symbol: string } | null {
  const trimmed = dedupeKey.trim();
  const match = /^sec:([^:]+):([^:]+)$/.exec(trimmed);
  if (!match) return null;
  const accession = match[1]?.trim();
  const symbol = match[2]?.trim().toUpperCase();
  if (!accession || !symbol) return null;
  return { accession, symbol };
}

function normalizeCik(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return String(Math.trunc(raw)).padStart(10, "0");
  }
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return digits.padStart(10, "0");
}

function readAccession(row: SecHistoricalRowInput): string | null {
  const fromFacts = row.facts.accession_number;
  if (typeof fromFacts === "string" && fromFacts.trim()) return fromFacts.trim();
  if (typeof row.provider_article_id === "string" && row.provider_article_id.trim()) {
    return row.provider_article_id.trim();
  }
  return null;
}

export function buildSecFeedEntryFromHistoricalRow(
  row: SecHistoricalRowInput,
): { entry: SecFeedEntry | null; error: string | null } {
  const formTypeRaw = row.facts.form_type;
  const form_type = typeof formTypeRaw === "string" ? formTypeRaw.trim().toUpperCase() : "";
  const cik = normalizeCik(row.facts.cik);
  const accession_number = readAccession(row);
  if (!form_type) return { entry: null, error: "MISSING_FORM_TYPE" };
  if (!cik) return { entry: null, error: "MISSING_CIK" };
  if (!accession_number) return { entry: null, error: "MISSING_ACCESSION" };

  const acceptedRaw = row.facts.accepted_at;
  const filingDateRaw = row.facts.filing_date;
  return {
    entry: {
      form_type,
      cik,
      accession_number,
      company_name: row.company_name,
      filing_date: typeof filingDateRaw === "string" ? filingDateRaw : null,
      accepted_at: typeof acceptedRaw === "string" ? acceptedRaw : null,
      filing_url: typeof row.facts.source_url === "string" ? row.facts.source_url : null,
      primary_document: null,
      sec_items: Array.isArray(row.facts.sec_items)
        ? row.facts.sec_items.filter((v) => typeof v === "string") as string[]
        : null,
    },
    error: null,
  };
}

export function classifyHistoricalSecRow(
  row: SecHistoricalRowInput,
  cikMap: CikTickerMap,
): SecHistoricalClassificationResult {
  const base = {
    dedupe_key: row.dedupe_key,
    symbol: row.symbol.trim().toUpperCase(),
    form_type: null as string | null,
    cik: null as string | null,
    accession_number: null as string | null,
    cik_listing_count: 0,
    resolver_target_tickers: [] as string[],
    resolver_reason: null as SecFilingAttributionReason | null,
  };

  if (row.provider !== "sec_edgar") {
    return {
      ...base,
      classification: "unresolved",
      reason_code: "NOT_SEC_EDGAR_PROVIDER",
    };
  }

  if (row.verification_state === "attribution_invalidated") {
    return {
      ...base,
      classification: "unresolved",
      reason_code: "ALREADY_INVALIDATED",
    };
  }

  const parsedKey = parseSecV1cDedupeKey(row.dedupe_key);
  if (!parsedKey) {
    return { ...base, classification: "unresolved", reason_code: "INVALID_DEDUPE_KEY" };
  }

  if (parsedKey.symbol !== base.symbol) {
    return { ...base, classification: "unresolved", reason_code: "DEDUPE_SYMBOL_MISMATCH" };
  }

  const built = buildSecFeedEntryFromHistoricalRow(row);
  if (!built.entry) {
    return {
      ...base,
      classification: "unresolved",
      reason_code: built.error ?? "ENTRY_BUILD_FAILED",
    };
  }

  const accession = built.entry.accession_number;
  if (accession !== parsedKey.accession) {
    return {
      ...base,
      form_type: built.entry.form_type,
      cik: built.entry.cik,
      accession_number: accession,
      classification: "unresolved",
      reason_code: "ACCESSION_DEDUPE_MISMATCH",
    };
  }

  const mapped = cikMap.get(built.entry.cik) ?? [];
  if (mapped.length === 0) {
    return {
      ...base,
      form_type: built.entry.form_type,
      cik: built.entry.cik,
      accession_number: accession,
      classification: "unresolved",
      reason_code: "CIK_NOT_IN_CURRENT_MAP",
    };
  }

  const attribution = resolveSecFilingAttribution(built.entry, mapped);
  const targetTickers = attribution.targets.map((t) => t.ticker);
  const symbolOnCik = mapped.some((m) => m.ticker === base.symbol);

  const resultBase = {
    ...base,
    form_type: built.entry.form_type,
    cik: built.entry.cik,
    accession_number: accession,
    cik_listing_count: mapped.length,
    resolver_target_tickers: targetTickers,
    resolver_reason: attribution.reason,
  };

  if (!symbolOnCik) {
    return {
      ...resultBase,
      classification: "unresolved",
      reason_code: "SYMBOL_NOT_ON_CIK_MAP",
    };
  }

  if (targetTickers.includes(base.symbol)) {
    return {
      ...resultBase,
      classification: "legitimate",
      reason_code: "RESOLVER_ATTRIBUTION_MATCH",
    };
  }

  if (targetTickers.length === 0) {
    return {
      ...resultBase,
      classification: "confirmed_misattribution",
      reason_code: attribution.reason ?? "NO_RESOLVER_TARGET",
    };
  }

  return {
    ...resultBase,
    classification: "confirmed_misattribution",
    reason_code: "RESOLVER_SELECTED_OTHER_TICKER",
  };
}

export type SecClassificationSummary = {
  policy_version: string;
  total_rows: number;
  confirmed_misattribution: number;
  legitimate: number;
  unresolved: number;
  by_reason: Record<string, number>;
};

export function summarizeSecHistoricalClassifications(
  results: readonly SecHistoricalClassificationResult[],
): SecClassificationSummary {
  const by_reason: Record<string, number> = {};
  let confirmed_misattribution = 0;
  let legitimate = 0;
  let unresolved = 0;
  for (const row of results) {
    by_reason[row.reason_code] = (by_reason[row.reason_code] ?? 0) + 1;
    if (row.classification === "confirmed_misattribution") confirmed_misattribution += 1;
    else if (row.classification === "legitimate") legitimate += 1;
    else unresolved += 1;
  }
  return {
    policy_version: SEC_V1C_REMEDIATION_POLICY_VERSION,
    total_rows: results.length,
    confirmed_misattribution,
    legitimate,
    unresolved,
    by_reason,
  };
}
