import { parse as parseXml } from "jsr:@libs/xml";
import {
  type CatalystEventRow,
  isValidTicker,
  nonEmptyTrimmed,
} from "../catalyst/contract.ts";

export const SEC_LATEST_FILINGS_ATOM_URL =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&owner=include&count=100&output=atom";
export const SEC_COMPANY_TICKERS_EXCHANGE_URL =
  "https://www.sec.gov/files/company_tickers_exchange.json";

export const SEC_MAX_REQUESTS_PER_SECOND = 5;
export const SEC_MIN_REQUEST_INTERVAL_MS = Math.ceil(1000 / SEC_MAX_REQUESTS_PER_SECOND);
export const SEC_REQUEST_TIMEOUT_MS = 8_000;
export const SEC_BACKOFF_MS = [350, 900, 1_800] as const;

export const SEC_INCLUDED_FORMS = new Set<string>([
  "8-K",
  "8-K/A",
  "6-K",
  "6-K/A",
  "10-Q",
  "10-Q/A",
  "10-K",
  "10-K/A",
  "20-F",
  "20-F/A",
  "S-1",
  "S-1/A",
  "F-1",
  "F-1/A",
  "S-3",
  "S-3/A",
  "424B2",
  "424B3",
  "424B4",
  "424B5",
]);

export interface SecSyncSummary {
  feed_entries_read: number;
  relevant_forms_found: number;
  mapped_issuers: number;
  unmapped_issuers: number;
  rows_validated: number;
  rows_upserted: number;
  rows_skipped_existing: number;
  rows_rejected: number;
  sec_requests: number;
}

export function emptySecSummary(): SecSyncSummary {
  return {
    feed_entries_read: 0,
    relevant_forms_found: 0,
    mapped_issuers: 0,
    unmapped_issuers: 0,
    rows_validated: 0,
    rows_upserted: 0,
    rows_skipped_existing: 0,
    rows_rejected: 0,
    sec_requests: 0,
  };
}

export function sanitizeSecSummary(input: SecSyncSummary): SecSyncSummary {
  const nn = (n: number) =>
    (typeof n === "number" && Number.isFinite(n) && n >= 0) ? Math.floor(n) : 0;
  return {
    feed_entries_read: nn(input.feed_entries_read),
    relevant_forms_found: nn(input.relevant_forms_found),
    mapped_issuers: nn(input.mapped_issuers),
    unmapped_issuers: nn(input.unmapped_issuers),
    rows_validated: nn(input.rows_validated),
    rows_upserted: nn(input.rows_upserted),
    rows_skipped_existing: nn(input.rows_skipped_existing),
    rows_rejected: nn(input.rows_rejected),
    sec_requests: nn(input.sec_requests),
  };
}

export interface SecFeedEntry {
  form_type: string;
  cik: string; // zero-padded 10-digit
  company_name: string | null;
  accession_number: string;
  filing_date: string | null; // YYYY-MM-DD
  accepted_at: string | null; // ISO
  filing_url: string | null;
  primary_document: string | null;
  sec_items: string[] | null;
}

export interface SecTickerRow {
  ticker: string;
  exchange: string | null;
}

export type CikTickerMap = Map<string, SecTickerRow[]>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeFormType(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  return t.length > 0 ? t : null;
}

export function normalizeCik(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  return digits.padStart(10, "0");
}

export function normalizeAccession(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  const m = t.match(/\b(\d{10}-\d{2}-\d{6})\b/);
  return m ? m[1] : null;
}

function toIsoOrNull(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function ymdOrNull(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function extractFiledDate(summaryText: string): string | null {
  const m = summaryText.match(/\bFiled:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\b/i);
  return m ? ymdOrNull(m[1]) : null;
}

function extractAccession(summaryText: string): string | null {
  const m = summaryText.match(/\bAccNo:\s*([0-9]{10}-[0-9]{2}-[0-9]{6})\b/i);
  return m ? normalizeAccession(m[1]) : null;
}

/** Extract explicit "Item X.XX" identifiers only. Never invent or interpret items. */
export function extractSecItems(summaryText: string): string[] | null {
  if (!summaryText) return null;
  const seen = new Set<string>();
  const items: string[] = [];
  for (const match of summaryText.matchAll(/\bItem\s+(\d+\.\d{2})\b/gi)) {
    const num = match[1];
    if (!num || seen.has(num)) continue;
    seen.add(num);
    items.push(num);
  }
  return items.length > 0 ? items : null;
}

export function formatSecFilingDescription(
  formType: string,
  secItems: string[] | null,
): string {
  if (!secItems || secItems.length === 0) {
    return `Form ${formType} filed with the SEC.`;
  }
  if (secItems.length === 1) return `Form ${formType} — Items ${secItems[0]}`;
  if (secItems.length === 2) {
    return `Form ${formType} — Items ${secItems[0]} and ${secItems[1]}`;
  }
  const head = secItems.slice(0, -1).join(", ");
  return `Form ${formType} — Items ${head} and ${secItems[secItems.length - 1]}`;
}

function entryFormType(categoryTerm: unknown, titleText: string): string | null {
  const fromCategory = normalizeFormType(categoryTerm);
  if (fromCategory) return fromCategory;
  const titleLead = titleText.match(/^\s*([A-Za-z0-9/-]+)\s*-/);
  return titleLead ? normalizeFormType(titleLead[1]) : null;
}

function entryCik(titleText: string): string | null {
  const m = titleText.match(/\((\d{1,10})\)\s*\([^)]+\)\s*$/);
  return m ? normalizeCik(m[1]) : null;
}

/**
 * SEC Latest Filings Atom titles use:
 *   {FORM} - {COMPANY NAME} ({CIK}) ({ROLE})
 * e.g. "8-K - NVIDIA CORP (0001045810) (Filer)"
 * Fail closed when the verified structure is not present.
 */
export function parseSecAtomCompanyName(titleText: string): string | null {
  const m = titleText.match(/^\S+\s+-\s+(.+)\s+\((\d{1,10})\)\s+\([^)]+\)\s*$/);
  if (!m) return null;
  return nonEmptyTrimmed(m[1]);
}

function hrefFromLink(link: unknown): string | null {
  if (!link || typeof link !== "object") return null;
  const obj = link as Record<string, unknown>;
  const href = obj["@_href"] ?? obj["@href"] ?? obj["@_href"] ?? obj["@href"];
  if (typeof href !== "string") return null;
  try {
    const u = new URL(href);
    if (u.protocol === "https:") return u.toString();
  } catch {
    return null;
  }
  return null;
}

function entryFilingUrl(linkNode: unknown): string | null {
  if (Array.isArray(linkNode)) {
    for (const link of linkNode) {
      const href = hrefFromLink(link);
      if (href) return href;
    }
    return null;
  }
  const href = hrefFromLink(linkNode);
  if (href) return href;
  if (linkNode && typeof linkNode === "object") {
    return entryFilingUrl((linkNode as Record<string, unknown>).link);
  }
  return null;
}

export function parseLatestFilingsAtom(xml: string): SecFeedEntry[] {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseXml(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  const feed = parsed.feed as Record<string, unknown> | undefined;
  if (!feed) return [];
  const entriesRaw = feed.entry;
  const entryObjects = Array.isArray(entriesRaw)
    ? entriesRaw
    : entriesRaw && typeof entriesRaw === "object"
    ? [entriesRaw]
    : [];
  const entries: SecFeedEntry[] = [];
  for (const raw of entryObjects) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const titleText = typeof entry.title === "string" ? entry.title : "";
    const idText = typeof entry.id === "string" ? entry.id : "";
    const updatedText = typeof entry.updated === "string" ? entry.updated : "";
    const summaryNode = entry.summary;
    const summaryText = typeof summaryNode === "string"
      ? summaryNode
      : (summaryNode && typeof summaryNode === "object" && typeof (summaryNode as Record<string, unknown>)["#text"] === "string")
      ? String((summaryNode as Record<string, unknown>)["#text"])
      : "";

    const categoryNode = entry.category;
    const categoryTerm = Array.isArray(categoryNode)
      ? (categoryNode.find((x) =>
        x && typeof x === "object" &&
        (typeof (x as Record<string, unknown>)["@_term"] === "string" ||
          typeof (x as Record<string, unknown>)["@term"] === "string")
      ) as Record<string, unknown> | undefined)?.["@_term"] ??
        (categoryNode.find((x) =>
          x && typeof x === "object" && typeof (x as Record<string, unknown>)["@term"] === "string"
        ) as Record<string, unknown> | undefined)?.["@term"]
      : (categoryNode && typeof categoryNode === "object")
      ? ((categoryNode as Record<string, unknown>)["@_term"] ??
        (categoryNode as Record<string, unknown>)["@term"])
      : null;

    const formType = entryFormType(categoryTerm, titleText);
    const cik = entryCik(titleText);
    const companyName = parseSecAtomCompanyName(titleText);
    const accession = normalizeAccession(idText) ?? extractAccession(summaryText);
    const filingDate = extractFiledDate(summaryText);
    const acceptedAt = toIsoOrNull(updatedText);
    const filingUrl = entryFilingUrl(entry.link);
    const secItems = extractSecItems(summaryText);

    if (!formType || !cik || !accession) continue;
    entries.push({
      form_type: formType,
      cik,
      company_name: companyName,
      accession_number: accession,
      filing_date: filingDate,
      accepted_at: acceptedAt,
      filing_url: filingUrl,
      // Atom latest-filings links are filing index pages, not the primary document.
      // Leave null unless a later sprint obtains the actual document from verified SEC metadata.
      primary_document: null,
      sec_items: secItems,
    });
  }
  return entries;
}

export function parseCompanyTickersExchangeJson(payload: unknown): CikTickerMap {
  const out = new Map<string, SecTickerRow[]>();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return out;
  const p = payload as { data?: unknown };
  if (!Array.isArray(p.data)) return out;
  for (const row of p.data) {
    if (!Array.isArray(row) || row.length < 4) continue;
    const cik = normalizeCik(row[0]);
    const ticker = typeof row[2] === "string" ? row[2].trim().toUpperCase() : "";
    const exchange = typeof row[3] === "string" ? row[3].trim() : null;
    if (!cik || !ticker || !isValidTicker(ticker)) continue;
    const list = out.get(cik) ?? [];
    if (!list.some((it) => it.ticker === ticker)) {
      list.push({ ticker, exchange });
      list.sort((a, b) => a.ticker.localeCompare(b.ticker));
      out.set(cik, list);
    }
  }
  return out;
}

export function secDedupeKey(accessionNumber: string, symbol: string): string {
  return `sec:${accessionNumber}:${symbol}`;
}

// SEC ingestion stores FACTS only. No directional or market interpretation.
function secFacts(entry: SecFeedEntry, exchange: string | null): Record<string, unknown> {
  return {
    source_kind: "sec_filing",
    form_type: entry.form_type,
    cik: entry.cik,
    accession_number: entry.accession_number,
    filing_date: entry.filing_date,
    accepted_at: entry.accepted_at,
    report_date: null,
    primary_document: entry.primary_document,
    sec_items: entry.sec_items,
    exchange,
  };
}

export function partitionNewRows<T extends { dedupe_key: string }>(
  rows: readonly T[],
  existingKeys: ReadonlySet<string>,
): { existing: T[]; incoming: T[] } {
  const existing: T[] = [];
  const incoming: T[] = [];
  for (const row of rows) {
    if (existingKeys.has(row.dedupe_key)) existing.push(row);
    else incoming.push(row);
  }
  return { existing, incoming };
}

export function toCatalystRowsFromSec(
  entries: SecFeedEntry[],
  cikToTickers: CikTickerMap,
  summary: SecSyncSummary,
): CatalystEventRow[] {
  const rows: CatalystEventRow[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    summary.feed_entries_read += 1;
    if (!SEC_INCLUDED_FORMS.has(entry.form_type)) {
      summary.rows_rejected += 1;
      continue;
    }
    summary.relevant_forms_found += 1;
    const mapped = cikToTickers.get(entry.cik) ?? [];
    if (mapped.length === 0) {
      summary.unmapped_issuers += 1;
      continue;
    }
    summary.mapped_issuers += 1;

    const related = mapped.map((m) => m.ticker);
    for (const target of mapped) {
      const dedupe = secDedupeKey(entry.accession_number, target.ticker);
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);

      const eventDate =
        entry.filing_date ??
        (entry.accepted_at ? entry.accepted_at.slice(0, 10) : null);
      if (!eventDate) {
        summary.rows_rejected += 1;
        continue;
      }

      rows.push({
        dedupe_key: dedupe,
        symbol: target.ticker,
        company_name: entry.company_name,
        event_type: "sec_filing_news",
        verification_state: "provider_reported",
        event_date: eventDate,
        event_time: entry.accepted_at,
        time_of_day: null,
        title: `${target.ticker} filed Form ${entry.form_type}`,
        description: formatSecFilingDescription(entry.form_type, entry.sec_items),
        source_name: "SEC EDGAR",
        source_url: entry.filing_url,
        provider: "sec_edgar",
        provider_article_id: entry.accession_number,
        related_symbols: related.filter((t) => t !== target.ticker),
        facts: secFacts(entry, target.exchange),
        published_at: entry.accepted_at,
      });
      summary.rows_validated += 1;
    }
  }
  return rows;
}

type FetchLike = typeof fetch;

export type SecFetchResult =
  | { ok: true; status: number; text: string; json: unknown }
  | { ok: false; reason: "PROVIDER_TIMEOUT" | "PROVIDER_RATE_LIMITED" | "PROVIDER_FORBIDDEN" | "PROVIDER_ERROR" };

function isTimeoutOrAbort(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

interface SecRequesterDeps {
  fetchFn?: FetchLike;
  nowMs?: () => number;
  sleepFn?: (ms: number) => Promise<void>;
}

export function createSecRequester(
  userAgent: string,
  summary: SecSyncSummary,
  deps: SecRequesterDeps = {},
) {
  const fetchFn = deps.fetchFn ?? fetch;
  const nowMs = deps.nowMs ?? (() => Date.now());
  const sleepFn = deps.sleepFn ?? sleep;
  let lastRequestAt = 0;

  return async function secFetch(url: string): Promise<SecFetchResult> {
    for (let attempt = 0; attempt < SEC_BACKOFF_MS.length; attempt += 1) {
      const now = nowMs();
      const waitMs = Math.max(0, SEC_MIN_REQUEST_INTERVAL_MS - (now - lastRequestAt));
      if (waitMs > 0) await sleepFn(waitMs);

      summary.sec_requests += 1;
      lastRequestAt = nowMs();

      let res: Response;
      try {
        res = await fetchFn(url, {
          method: "GET",
          signal: AbortSignal.timeout(SEC_REQUEST_TIMEOUT_MS),
          headers: {
            "User-Agent": userAgent,
            "Accept": "application/atom+xml, application/xml, text/xml, application/json, text/plain",
          },
        });
      } catch (err) {
        const timedOut = isTimeoutOrAbort(err);
        if (attempt < SEC_BACKOFF_MS.length - 1) {
          await sleepFn(SEC_BACKOFF_MS[attempt]);
          continue;
        }
        return { ok: false, reason: timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR" };
      }

      if (res.status === 429) {
        if (attempt < SEC_BACKOFF_MS.length - 1) {
          await sleepFn(SEC_BACKOFF_MS[attempt]);
          continue;
        }
        return { ok: false, reason: "PROVIDER_RATE_LIMITED" };
      }
      if (res.status === 403) {
        return { ok: false, reason: "PROVIDER_FORBIDDEN" };
      }
      if (res.status >= 500) {
        if (attempt < SEC_BACKOFF_MS.length - 1) {
          await sleepFn(SEC_BACKOFF_MS[attempt]);
          continue;
        }
        return { ok: false, reason: "PROVIDER_ERROR" };
      }
      if (!res.ok) return { ok: false, reason: "PROVIDER_ERROR" };

      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { ok: true, status: res.status, text, json };
    }
    return { ok: false, reason: "PROVIDER_ERROR" };
  };
}
