import { UniqueConflictError } from "./conflicts.ts";

/** Item processing failed after the feed itself was fetched. */
export class ItemIngestError extends Error {
  readonly category = "item_ingest_error";

  constructor(
    readonly stage: string,
    readonly errorCode: string | null,
    message: string,
  ) {
    super(message);
    this.name = "ItemIngestError";
  }
}

const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+\S+/gi,
  /SYNC_SECRET[=:\s]+\S+/gi,
  /service[_-]?role[_-]?key[=:\s]+\S+/gi,
  /authorization["']?\s*[:=]\s*["'][^"']+["']/gi,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /sb_secret_[A-Za-z0-9_-]+/g,
];

export function sanitizeOperationalText(value: string, max = 300): string {
  let text = value;
  for (const pattern of SECRET_PATTERNS) text = text.replace(pattern, "[redacted]");
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function itemIngestDiagnostic(
  err: unknown,
  ctx: { sourceKey: string; itemIndex: number; itemIdentity: string | null },
): Record<string, unknown> {
  const error = err instanceof Error ? err : new Error("item_ingest_failed");
  const blob = `${error.message}\n${error.stack ?? ""}`;
  const stage = err instanceof ItemIngestError
    ? err.stage
    : /mergeRawMetadata|immutable|append-only/i.test(blob)
    ? "existing_raw"
    : /attributeCandidate/i.test(blob)
    ? "attribution"
    : /insertEvent|updateEvent|insertEvidence/i.test(blob)
    ? "event_persistence"
    : "item_ingest";
  const errorCode = err instanceof ItemIngestError
    ? err.errorCode
    : err instanceof UniqueConflictError
    ? err.code
    : null;
  const stack = error.stack ? sanitizeOperationalText(error.stack, 500) : null;
  return {
    source_key: ctx.sourceKey,
    item_index: ctx.itemIndex,
    item_identity: ctx.itemIdentity,
    stage,
    error_code: errorCode,
    message: sanitizeOperationalText(error.message || "item_ingest_failed"),
    ...(stack ? { stack } : {}),
  };
}

export function safeItemIdentity(item: { externalId: string | null; contentHash: string }): string | null {
  const identity = item.externalId?.trim() || item.contentHash;
  if (!identity) return null;
  return sanitizeOperationalText(identity, 160);
}
