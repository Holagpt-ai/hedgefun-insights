import { parseLoadedCheckpoint, type SecEdgarCheckpoint } from "../sec-edgar/checkpoint.ts";
import type { SourceRecord } from "./types.ts";
import {
  writeSecIntelContinuation,
  type SecFetchMetadataPatch,
  type SecIntelContinuation,
} from "./sec-intel-continuation.ts";

export type { SecFetchMetadataPatch };

/** Persistable checkpoint shape for `source.metadata.checkpoint` (markSuccess contract). */
export function checkpointMetadataRecord(checkpoint: SecEdgarCheckpoint): Record<string, unknown> {
  return { ...checkpoint };
}

function unwrapCheckpointRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const row = raw as Record<string, unknown>;
  if (row.stream_key === "issuer_direct_latest_filings" && Array.isArray(row.anchor_accessions)) {
    return row;
  }
  if (row.sec_edgar_intel && typeof row.sec_edgar_intel === "object") {
    return row.sec_edgar_intel;
  }
  if (row.checkpoint && typeof row.checkpoint === "object") {
    return row.checkpoint;
  }
  return raw;
}

export function readSecIntelCheckpoint(metadata: Record<string, unknown>): SecEdgarCheckpoint | null {
  const raw = unwrapCheckpointRaw(metadata.sec_edgar_intel ?? metadata.checkpoint);
  const parsed = parseLoadedCheckpoint(raw);
  return parsed.ok ? parsed.checkpoint : null;
}

/** Mirrors run-bot markSuccess checkpoint + SEC continuation persistence. */
export function applySecFetchMetadataToSource(
  source: SourceRecord,
  patch: SecFetchMetadataPatch,
  nowIso: string,
  contentHash: string | null,
  continuationComplete: boolean,
): void {
  source.lastSuccessAt = nowIso;
  source.failureCount = 0;
  source.backoffUntil = null;
  source.lastErrorCategory = null;
  if (contentHash && continuationComplete) source.lastContentHash = contentHash;
  source.metadata = writeSecIntelContinuation(source.metadata, patch.continuation);
  if (patch.batchComplete && patch.checkpoint) {
    source.metadata = { ...source.metadata, checkpoint: patch.checkpoint };
  }
}
