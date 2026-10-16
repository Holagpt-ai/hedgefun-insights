import type { SecEdgarCheckpoint } from "../sec-edgar/checkpoint.ts";
import { parseLoadedCheckpoint } from "../sec-edgar/checkpoint.ts";
import type { SecFeedEntry } from "../sec-edgar/ingest.ts";

export interface SecIntelContinuation {
  page_content_hash: string;
  next_index: number;
  batch_accessions: string[];
  pending_checkpoint: SecEdgarCheckpoint;
}

export interface SecFetchMetadataPatch {
  checkpoint: Record<string, unknown> | null;
  continuation: SecIntelContinuation | null;
  batchComplete: boolean;
  /** Index in `batch_accessions` where this run's slice begins. */
  workloadStartIndex: number;
  /** When the batch completes, persist this hash so newer page-zero prepends remain discoverable. */
  successContentHash: string | null;
}

export function accessionsMissingFromWalk(
  accessions: readonly string[],
  entries: readonly SecFeedEntry[],
): string[] {
  const found = new Set(entries.map((entry) => entry.accession_number));
  return accessions.filter((acc) => !found.has(acc));
}

export function readSecIntelContinuation(
  metadata: Record<string, unknown>,
): SecIntelContinuation | null {
  const raw = metadata.sec_intel_continuation;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.page_content_hash !== "string" || row.page_content_hash.trim() === "") return null;
  if (typeof row.next_index !== "number" || !Number.isInteger(row.next_index) || row.next_index < 0) {
    return null;
  }
  if (!Array.isArray(row.batch_accessions) || row.batch_accessions.length === 0) return null;
  const batch_accessions = row.batch_accessions.filter((v): v is string => typeof v === "string");
  if (batch_accessions.length !== row.batch_accessions.length) return null;
  const parsed = parseLoadedCheckpoint(row.pending_checkpoint);
  if (!parsed.ok) return null;
  return {
    page_content_hash: row.page_content_hash,
    next_index: row.next_index,
    batch_accessions,
    pending_checkpoint: parsed.checkpoint,
  };
}

export function writeSecIntelContinuation(
  metadata: Record<string, unknown>,
  continuation: SecIntelContinuation | null,
): Record<string, unknown> {
  const next = { ...metadata };
  if (continuation == null) {
    delete next.sec_intel_continuation;
    return next;
  }
  next.sec_intel_continuation = continuation;
  return next;
}

export function entriesInAccessionOrder(
  entries: readonly SecFeedEntry[],
  accessions: readonly string[],
): SecFeedEntry[] {
  const byAcc = new Map<string, SecFeedEntry>();
  for (const entry of entries) {
    if (!byAcc.has(entry.accession_number)) byAcc.set(entry.accession_number, entry);
  }
  const out: SecFeedEntry[] = [];
  for (const acc of accessions) {
    const entry = byAcc.get(acc);
    if (entry) out.push(entry);
  }
  return out;
}
