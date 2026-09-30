import { canonicalUrl } from "../catalyst/attribution.ts";
import { sha256Hex } from "../catalyst/contract.ts";
import { FIXTURE_MARKER, type RawSourceItem } from "./types.ts";

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;

export function normalizeTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  return TICKER_RE.test(t) ? t : null;
}

export function normalizeWhitespace(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function excerpt(raw: string | null | undefined, max = 1500): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  return t.length <= max ? t : t.slice(0, max);
}

/** Stable hash of normalized title and summary. Source URL is excluded so syndication can match. */
export async function contentHash(title: string, summary: string | null): Promise<string> {
  const body = `${normalizeWhitespace(title)}\n${normalizeWhitespace(summary ?? "")}`;
  return await sha256Hex(body);
}

/**
 * Convert a timestamp to UTC ISO. Returns null when the value is missing
 * or unparseable. Never substitutes the current time.
 */
export function toUtcIso(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = Date.parse(raw.trim());
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

/** Calendar date only (YYYY-MM-DD). Does not invent a clock time. */
export function toIsoDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function canonicalHttpsUrl(raw: unknown): string | null {
  return canonicalUrl(raw);
}

export function isFixturePayload(metadata: Record<string, unknown> | null | undefined): boolean {
  if (!metadata) return false;
  return metadata[FIXTURE_MARKER] === true || metadata.fixture === true;
}

export async function buildRawItem(input: {
  sourceId: string;
  sourceType: RawSourceItem["sourceType"];
  externalId: string | null;
  canonicalUrl: string | null;
  publishedAt: string | null;
  discoveredAt: string;
  title: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
}): Promise<RawSourceItem> {
  const title = input.title?.trim() || null;
  const summary = input.summary?.trim() || null;
  return {
    sourceId: input.sourceId,
    sourceType: input.sourceType,
    externalId: input.externalId?.trim() || null,
    canonicalUrl: input.canonicalUrl,
    publishedAt: input.publishedAt,
    discoveredAt: input.discoveredAt,
    title,
    summary,
    contentHash: await contentHash(title ?? "", summary),
    metadata: input.metadata,
  };
}

export function titleTokens(title: string): Set<string> {
  const stop = new Set([
    "a", "an", "the", "to", "for", "of", "and", "or", "will", "be", "on", "in",
    "at", "with", "from", "by", "its", "this", "that", "into", "over", "after",
    "before", "their", "are", "is", "as", "our", "host",
  ]);
  const out = new Set<string>();
  const norm = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  for (const token of norm.split(/\s+/)) {
    if (token.length < 3 || stop.has(token)) continue;
    out.add(token);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) if (b.has(token)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
