/**
 * Catch-up eligibility queue helpers — avoid head-of-line blocking when unresolved
 * symbols remain eligible without daily history (Batch 33.9).
 */

export function sliceEligibleQueue(
  eligible: readonly string[],
  offset: number,
  scanSize: number,
): { window: readonly string[]; nextOffset: number } {
  const boundedOffset = Math.min(Math.max(0, offset), eligible.length);
  const end = Math.min(boundedOffset + Math.max(0, scanSize), eligible.length);
  return { window: eligible.slice(boundedOffset, end), nextOffset: end };
}

/** Max symbols to scan from the queue per batch (>= tranche size). */
export function resolveCatchUpScanBudget(input: {
  trancheSize: number;
  remainingSymbolBudget: number;
  maxScansPerBatch: number;
}): number {
  const cap = Math.min(input.trancheSize, input.remainingSymbolBudget, input.maxScansPerBatch);
  return Math.max(1, cap);
}

export function readCatchUpQueueOffset(
  raw: string | undefined,
  eligibleLength: number,
): number {
  const trimmed = raw?.trim();
  if (!trimmed) return 0;
  if (!/^\d+$/.test(trimmed)) return 0;
  const n = Number.parseInt(trimmed, 10);
  if (n < 0) return 0;
  if (n >= eligibleLength) return 0;
  return n;
}