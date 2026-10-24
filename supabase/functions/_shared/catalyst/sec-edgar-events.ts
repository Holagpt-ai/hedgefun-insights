/**
 * Catalyst Intelligence V2 — verified SEC EDGAR rows (read path only).
 * Deterministic classification, timing, attribution, and relevance signals.
 * No directional labels from form type alone.
 */

import type { CatalystFreshnessClass, CatalystRowLike, CatalystTaxonomyV2 } from "./intelligence-v2.ts";
import { isEligibleCatalystFeedRow, isSecEdgarCatalystRow } from "./catalyst-feed-eligibility.ts";

const FRESHNESS_BREAKING_MS = 6 * 60 * 60 * 1000;
const FRESHNESS_CURRENT_MS = 72 * 60 * 60 * 1000;
const FRESHNESS_PRIOR_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function eventMomentMs(row: CatalystRowLike): number | null {
  if (row.published_at) {
    const t = Date.parse(row.published_at);
    if (Number.isFinite(t)) return t;
  }
  if (row.event_time) {
    const t = Date.parse(row.event_time);
    if (Number.isFinite(t)) return t;
  }
  if (row.event_date) {
    const t = Date.parse(`${row.event_date}T12:00:00.000Z`);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

function classifyFreshnessV2(row: CatalystRowLike, nowMs: number): CatalystFreshnessClass {
  const m = eventMomentMs(row);
  if (m === null) return "historical";
  const age = nowMs - m;
  if (age < 0) return "current";
  if (age <= FRESHNESS_BREAKING_MS) return "breaking";
  if (age <= FRESHNESS_CURRENT_MS) return "current";
  if (age <= FRESHNESS_PRIOR_SESSION_MS) return "prior_session";
  if (age <= 30 * 24 * 60 * 60 * 1000) return "historical";
  return "stale_for_display";
}

export { isSecEdgarCatalystRow };

const OFFERING_FORMS = new Set([
  "S-1", "S-1/A", "F-1", "F-1/A", "S-3", "S-3/A",
  "424B2", "424B3", "424B4", "424B5", "424B7",
]);

const MA_FORMS = new Set(["S-4", "S-4/A", "425", "DEFM14A"]);

const FOREIGN_FORMS = new Set(["6-K", "6-K/A", "20-F", "20-F/A"]);

const INSIDER_FORMS = new Set(["4", "4/A"]);

export interface SecEdgarFactsParsed {
  form_type: string | null;
  filing_date: string | null;
  accepted_at: string | null;
  accession_number: string | null;
  sec_items: string[];
  attribution_level: "security" | "issuer_unattributed" | null;
  attribution_reason: string | null;
}

export function parseSecEdgarFacts(facts: Record<string, unknown> | null | undefined): SecEdgarFactsParsed {
  const f = facts ?? {};
  const formRaw = f.form_type;
  const form_type = typeof formRaw === "string" && formRaw.trim() ? formRaw.trim().toUpperCase() : null;
  const filing_date = typeof f.filing_date === "string" ? f.filing_date.slice(0, 10) : null;
  const accepted_at = typeof f.accepted_at === "string" ? f.accepted_at : null;
  const accession_number = typeof f.accession_number === "string" ? f.accession_number : null;
  const sec_items = Array.isArray(f.sec_items)
    ? f.sec_items.filter((x): x is string => typeof x === "string")
    : [];
  const levelRaw = f.attribution_level;
  const attribution_level = levelRaw === "security" || levelRaw === "issuer_unattributed"
    ? levelRaw
    : null;
  const attribution_reason = typeof f.attribution_reason === "string" ? f.attribution_reason : null;
  return {
    form_type,
    filing_date,
    accepted_at,
    accession_number,
    sec_items,
    attribution_level,
    attribution_reason,
  };
}

/** Item-aware taxonomy; form-only defaults never imply bullish/bearish. */
export function classifySecFilingTaxonomy(
  title: string,
  description: string | null | undefined,
  facts: Record<string, unknown> | null | undefined,
): CatalystTaxonomyV2 {
  const parsed = parseSecEdgarFacts(facts);
  const form = parsed.form_type ?? "";
  if (OFFERING_FORMS.has(form)) return "OFFERING";
  if (MA_FORMS.has(form)) return "M_AND_A";
  if (INSIDER_FORMS.has(form)) return "SEC_FILING";

  for (const item of parsed.sec_items) {
    if (item.startsWith("2.02")) return "EARNINGS";
    if (item.startsWith("7.01") || item.startsWith("8.01")) return "OTHER_VERIFIED";
    if (item.startsWith("5.02") || item.startsWith("5.03")) return "MANAGEMENT";
    if (item.startsWith("1.01") || item.startsWith("2.01")) return "M_AND_A";
    if (item.startsWith("2.03") || item.startsWith("3.02")) return "OFFERING";
  }

  const text = `${title} ${description ?? ""}`;
  if (/\b(?:guidance|outlook|forecast)\b/i.test(text)) return "GUIDANCE";
  if (FOREIGN_FORMS.has(form)) return "SEC_FILING";
  if (form.startsWith("8-K")) return "SEC_FILING";
  if (form.startsWith("10-")) return "SEC_FILING";
  return "SEC_FILING";
}

export function secFilingTypeLabel(facts: Record<string, unknown> | null | undefined): string {
  const form = parseSecEdgarFacts(facts).form_type;
  if (!form) return "SEC filing";
  if (FOREIGN_FORMS.has(form)) return `Foreign issuer · Form ${form}`;
  if (INSIDER_FORMS.has(form)) return `Insider transaction · Form ${form}`;
  return `Form ${form}`;
}

export interface SecFilingTimestamps {
  /** Calendar date stored on catalyst_events.event_date (often filing date). */
  filing_date: string | null;
  /** SEC acceptance timestamp when present. */
  accepted_at: string | null;
}

export function resolveSecFilingTimestamps(
  row: Pick<CatalystRowLike, "event_date" | "event_time" | "published_at" | "facts">,
): SecFilingTimestamps {
  const parsed = parseSecEdgarFacts(row.facts as Record<string, unknown> | undefined);
  return {
    filing_date: parsed.filing_date ?? row.event_date ?? null,
    accepted_at: parsed.accepted_at ?? row.published_at ?? row.event_time ?? null,
  };
}

export type SecAttributionConfidence = "high" | "medium" | "unavailable";

export function secAttributionConfidence(
  facts: Record<string, unknown> | null | undefined,
): { confidence: SecAttributionConfidence; statusLabel: string } {
  const parsed = parseSecEdgarFacts(facts);
  if (parsed.attribution_level === "security") {
    return { confidence: "high", statusLabel: "Ticker attributed (security-level)" };
  }
  if (parsed.attribution_level === "issuer_unattributed") {
    return { confidence: "medium", statusLabel: "Issuer-level filing" };
  }
  return { confidence: "unavailable", statusLabel: "Attribution not available" };
}

export interface SecRelevanceSignal {
  id: string;
  label: string;
  available: boolean;
}

export function buildSecRelevanceSignals(
  row: CatalystRowLike,
  nowMs: number,
): SecRelevanceSignal[] {
  const parsed = parseSecEdgarFacts(row.facts as Record<string, unknown> | undefined);
  const freshness = classifyFreshnessV2(row, nowMs);
  const attr = secAttributionConfidence(row.facts as Record<string, unknown> | undefined);
  const materialItems = parsed.sec_items.length > 0;

  return [
    {
      id: "form_type",
      label: parsed.form_type ? `Filing type: ${parsed.form_type}` : "Filing type unavailable",
      available: Boolean(parsed.form_type),
    },
    {
      id: "recency",
      label: `Recency: ${freshness.replace(/_/g, " ")}`,
      available: freshness !== "historical" && freshness !== "stale_for_display",
    },
    {
      id: "attribution",
      label: attr.statusLabel,
      available: attr.confidence !== "unavailable",
    },
    {
      id: "materiality",
      label: materialItems
        ? `Disclosed items: ${parsed.sec_items.join(", ")}`
        : "Item-level detail not in feed summary",
      available: materialItems,
    },
    {
      id: "market_reaction",
      label: "Market reaction: not computed for SEC filings",
      available: false,
    },
  ];
}

/** Scanner / radar enrichment: SEC rows must be feed-eligible and recently published. */
export function isEligibleSecEdgarForScannerSurfacing(
  row: CatalystRowLike,
  nowMs: number,
): boolean {
  if (!isSecEdgarCatalystRow(row.provider)) return true;
  if (!isEligibleCatalystFeedRow(row.verification_state)) return false;
  const freshness = classifyFreshnessV2(row, nowMs);
  if (freshness === "stale_for_display" || freshness === "historical") return false;
  const published = row.published_at ? Date.parse(row.published_at) : Number.NaN;
  if (!Number.isFinite(published)) return false;
  if (nowMs - published > FRESHNESS_PRIOR_SESSION_MS) return false;
  return true;
}

export function dedupeKeyForSecRow(row: CatalystRowLike): string | null {
  if (row.dedupe_key?.startsWith("sec:")) return row.dedupe_key;
  const accession = parseSecEdgarFacts(row.facts as Record<string, unknown>).accession_number;
  if (!accession || !row.symbol) return row.dedupe_key ?? null;
  return `sec:${accession}:${row.symbol.trim().toUpperCase()}`;
}
