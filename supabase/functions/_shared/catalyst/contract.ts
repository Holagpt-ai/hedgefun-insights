// Catalyst backbone shared contract.
// Closed set of event_type labels and normalized row shape used by
// sync-catalyst-events and downstream consumers. Descriptive labels only —
// no score, confidence, weight, rank, tier, or recommendation semantics.

export type CatalystEventType =
  | "earnings"
  | "fda_biotech"
  | "merger_acquisition"
  | "analyst_action"
  | "sec_filing_news"
  | "corporate_action"
  | "product_contract"
  | "company_news";

export const CATALYST_EVENT_TYPES: readonly CatalystEventType[] = [
  "earnings",
  "fda_biotech",
  "merger_acquisition",
  "analyst_action",
  "sec_filing_news",
  "corporate_action",
  "product_contract",
  "company_news",
] as const;

export type VerificationState = "provider_reported";
export type TimeOfDay = "before_open" | "after_close" | "during" | "unknown";

export interface CatalystEventRow {
  dedupe_key: string;
  symbol: string;
  company_name: string | null;
  event_type: CatalystEventType;
  verification_state: VerificationState;
  event_date: string; // YYYY-MM-DD, required
  event_time: string | null; // ISO timestamp or null
  time_of_day: TimeOfDay | null;
  title: string; // required, nonempty
  description: string | null;
  source_name: string;
  source_url: string | null;
  provider: string;
  provider_article_id: string | null;
  related_symbols: string[];
  facts: Record<string, unknown>;
  published_at: string | null;
}

/** Deterministic earnings display label — never a provider headline. */
export function earningsDisplayTitle(
  companyName: string | null,
  symbol: string,
): string {
  const base = (companyName && companyName.trim().length > 0)
    ? companyName.trim()
    : symbol;
  return `${base} earnings`;
}

export const TICKER_REGEX = /^[A-Z][A-Z0-9.-]{0,14}$/;

export function isValidTicker(x: unknown): x is string {
  return typeof x === "string" && TICKER_REGEX.test(x);
}

export function nonEmptyTrimmed(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim();
  return t.length > 0 ? t : null;
}

export function isHttpsUrl(x: unknown): x is string {
  if (typeof x !== "string") return false;
  try {
    const u = new URL(x);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function normalizeTitleForHash(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  const out = new Uint8Array(buf);
  let s = "";
  for (const b of out) s += b.toString(16).padStart(2, "0");
  return s;
}

export function earningsDedupeKey(symbol: string, reportDate: string): string {
  return `earnings:${symbol}:${reportDate}`;
}

export function polygonDedupeKey(articleId: string, symbol: string): string {
  return `polygon:${articleId}:${symbol}`;
}
