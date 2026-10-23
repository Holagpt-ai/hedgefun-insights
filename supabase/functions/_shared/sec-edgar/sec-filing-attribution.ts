/**
 * Conservative SEC filing → ticker attribution for V1C catalyst_events rows.
 * Prefer no ticker row over fan-out to every CIK listing.
 */

import type { SecFeedEntry, SecTickerRow } from "./ingest.ts";

/** Shelf / prospectus supplements — issuer-level unless one listing or explicit security evidence. */
export const SEC_ISSUER_LEVEL_FORMS = new Set([
  "424B2",
  "424B3",
  "424B4",
  "424B5",
  "S-3",
  "S-3/A",
  "S-1",
  "S-1/A",
  "F-1",
  "F-1/A",
]);

export type SecFilingAttributionReason =
  | "SINGLE_CIK_TICKER"
  | "EXPLICIT_TICKER_EVIDENCE"
  | "ISSUER_LEVEL_MULTI_TICKER"
  | "AMBIGUOUS_MULTI_CLASS"
  | "UNMAPPED_CIK"
  | "NO_ELIGIBLE_TICKER";

export type SecFilingAttributionLevel = "security" | "issuer_unattributed";

export type SecFilingAttribution = {
  targets: SecTickerRow[];
  level: SecFilingAttributionLevel;
  reason: SecFilingAttributionReason | null;
};

const EXCHANGE_TICKER_RE = /\((?:NYSE|Nasdaq|NYSE American|AMEX|OTC(?:QB|QX)?|BATS)[:\s]+([A-Z][A-Z0-9.^\-]{0,12})\)/i;
const PAREN_TICKER_RE = /\(([A-Z][A-Z0-9.-]{1,9})\)/g;

export function isPreferredOrStructuredTicker(ticker: string): boolean {
  const t = ticker.trim().toUpperCase();
  if (!t) return true;
  if (t.includes(".")) return true;
  if (t.includes("^")) return true;
  if (t.includes("-")) return true;
  if (/\+$/.test(t)) return true;
  return false;
}

export function extractExplicitTickerEvidence(entry: SecFeedEntry): string | null {
  const haystack = `${entry.company_name ?? ""}\n${entry.form_type}`;
  const exchange = haystack.match(EXCHANGE_TICKER_RE);
  if (exchange?.[1]) return exchange[1].trim().toUpperCase();
  for (const match of haystack.matchAll(PAREN_TICKER_RE)) {
    const candidate = match[1]?.trim().toUpperCase();
    if (!candidate || /^\d{10}$/.test(candidate)) continue;
    if (candidate === "ISSUER" || candidate === "FILER") continue;
    if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(candidate)) return candidate;
  }
  return null;
}

function commonShareCandidates(mapped: readonly SecTickerRow[]): SecTickerRow[] {
  return mapped.filter((row) => !isPreferredOrStructuredTicker(row.ticker));
}

export function resolveSecFilingAttribution(
  entry: SecFeedEntry,
  mapped: readonly SecTickerRow[],
): SecFilingAttribution {
  if (mapped.length === 0) {
    return { targets: [], level: "issuer_unattributed", reason: "UNMAPPED_CIK" };
  }

  const explicit = extractExplicitTickerEvidence(entry);
  if (explicit) {
    const hit = mapped.find((row) => row.ticker === explicit);
    if (hit) {
      return { targets: [hit], level: "security", reason: "EXPLICIT_TICKER_EVIDENCE" };
    }
    return { targets: [], level: "issuer_unattributed", reason: "NO_ELIGIBLE_TICKER" };
  }

  if (SEC_ISSUER_LEVEL_FORMS.has(entry.form_type)) {
    if (mapped.length === 1) {
      return { targets: [...mapped], level: "security", reason: "SINGLE_CIK_TICKER" };
    }
    return { targets: [], level: "issuer_unattributed", reason: "ISSUER_LEVEL_MULTI_TICKER" };
  }

  const commons = commonShareCandidates(mapped);
  if (commons.length === 1) {
    return { targets: commons, level: "security", reason: "SINGLE_CIK_TICKER" };
  }
  if (mapped.length === 1) {
    return { targets: [...mapped], level: "security", reason: "SINGLE_CIK_TICKER" };
  }
  return { targets: [], level: "issuer_unattributed", reason: "AMBIGUOUS_MULTI_CLASS" };
}

/** Stable issuer identity for non-ticker intelligence surfaces (not written to catalyst_events). */
export function secIssuerIdentityKey(accessionNumber: string): string {
  return `sec:${accessionNumber}:issuer`;
}

export function secFeedEntryFromMetadata(
  metadata: Record<string, unknown>,
  cik: string,
  publishedAt: string | null,
  canonicalUrl: string | null,
): SecFeedEntry | null {
  const formType = typeof metadata.formType === "string" ? metadata.formType.trim().toUpperCase() : null;
  const accession = typeof metadata.accession === "string" ? metadata.accession.trim() : null;
  if (!formType || !accession) return null;
  const secItems = metadata.secItems;
  return {
    form_type: formType,
    cik,
    accession_number: accession,
    company_name: typeof metadata.companyName === "string" ? metadata.companyName : null,
    filing_date: typeof metadata.filingDate === "string" ? metadata.filingDate : null,
    accepted_at: publishedAt,
    filing_url: canonicalUrl,
    primary_document: null,
    sec_items: Array.isArray(secItems) ? secItems.filter((v) => typeof v === "string") as string[] : null,
  };
}
