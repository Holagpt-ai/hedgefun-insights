// Accession-anchor checkpoint + official Latest Filings start= paging.
// Identities are observed accession numbers. Never compare accessions numerically.

import {
  buildLatestFilingsAtomUrl,
  parseLatestFilingsAtom,
  SEC_LATEST_FILINGS_PAGE_SIZE,
  type SecFeedEntry,
  type SecFetchResult,
} from "./ingest.ts";

export const SEC_EDGAR_STREAM_KEY = "issuer_direct_latest_filings";
export const SEC_LATEST_FILINGS_MAX_PAGES = 20;

export type CheckpointStatus =
  | "absent"
  | "bootstrapped"
  | "boundary_reached"
  | "gap"
  | "inconsistent"
  | "write_failed";

export interface SecEdgarCheckpoint {
  stream_key: string;
  anchor_accessions: string[];
  anchor_observed_at: string;
  last_success_at: string;
  head_updated_at: string | null;
  pages_fetched: number;
}

export function uniqueAccessionsInOrder(entries: readonly SecFeedEntry[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of entries) {
    const acc = entry.accession_number;
    if (!acc || seen.has(acc)) continue;
    seen.add(acc);
    out.push(acc);
  }
  return out;
}

export function dedupeEntriesByAccession(entries: readonly SecFeedEntry[]): SecFeedEntry[] {
  const seen = new Set<string>();
  const out: SecFeedEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.accession_number)) continue;
    seen.add(entry.accession_number);
    out.push(entry);
  }
  return out;
}

export function pageContainsAnyAnchor(
  pageAccessions: readonly string[],
  anchors: readonly string[],
): boolean {
  if (anchors.length === 0) return false;
  const wanted = new Set(anchors);
  return pageAccessions.some((acc) => wanted.has(acc));
}

export function normalizeAnchorAccessions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const acc = item.trim();
    if (!/^\d{10}-\d{2}-\d{6}$/.test(acc)) return null;
    if (seen.has(acc)) continue;
    seen.add(acc);
    out.push(acc);
  }
  return out;
}

export type PageWalkOk = {
  ok: true;
  checkpointStatus: "bootstrapped" | "boundary_reached";
  boundaryReached: boolean;
  pagesFetched: number;
  entriesScanned: number;
  page0Accessions: string[];
  page0HeadUpdatedAt: string | null;
  entries: SecFeedEntry[];
};

export type PageWalkFail = {
  ok: false;
  reason:
    | "CHECKPOINT_GAP"
    | "CHECKPOINT_INCONSISTENT"
    | "PROVIDER_TIMEOUT"
    | "PROVIDER_RATE_LIMITED"
    | "PROVIDER_FORBIDDEN"
    | "PROVIDER_ERROR";
  pagesFetched: number;
  entriesScanned: number;
};

export type PageWalkResult = PageWalkOk | PageWalkFail;

export async function walkLatestFilingsPages(
  fetchPage: (url: string) => Promise<SecFetchResult>,
  anchors: readonly string[] | null,
  maxPages = SEC_LATEST_FILINGS_MAX_PAGES,
): Promise<PageWalkResult> {
  const collected: SecFeedEntry[] = [];
  let pagesFetched = 0;
  let entriesScanned = 0;
  let page0Accessions: string[] = [];
  let page0HeadUpdatedAt: string | null = null;

  const bootstrap = anchors === null;

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    if (bootstrap && pageIndex > 0) break;
    const start = pageIndex * SEC_LATEST_FILINGS_PAGE_SIZE;
    const res = await fetchPage(buildLatestFilingsAtomUrl(start));
    if (!res.ok) {
      return { ok: false, reason: res.reason, pagesFetched, entriesScanned };
    }
    const pageEntries = parseLatestFilingsAtom(res.text);
    pagesFetched += 1;
    entriesScanned += pageEntries.length;

    if (pageIndex === 0) {
      if (pageEntries.length === 0) {
        return { ok: false, reason: "PROVIDER_ERROR", pagesFetched, entriesScanned };
      }
      page0Accessions = uniqueAccessionsInOrder(pageEntries);
      page0HeadUpdatedAt = pageEntries[0]?.accepted_at ?? null;
    } else if (pageEntries.length === 0) {
      return { ok: false, reason: "CHECKPOINT_INCONSISTENT", pagesFetched, entriesScanned };
    }

    collected.push(...pageEntries);
    const accessions = uniqueAccessionsInOrder(pageEntries);
    if (!bootstrap && pageContainsAnyAnchor(accessions, anchors ?? [])) {
      return {
        ok: true,
        checkpointStatus: "boundary_reached",
        boundaryReached: true,
        pagesFetched,
        entriesScanned,
        page0Accessions,
        page0HeadUpdatedAt,
        entries: dedupeEntriesByAccession(collected),
      };
    }
  }

  if (bootstrap) {
    return {
      ok: true,
      checkpointStatus: "bootstrapped",
      boundaryReached: false,
      pagesFetched,
      entriesScanned,
      page0Accessions,
      page0HeadUpdatedAt,
      entries: dedupeEntriesByAccession(collected),
    };
  }

  return { ok: false, reason: "CHECKPOINT_GAP", pagesFetched, entriesScanned };
}
