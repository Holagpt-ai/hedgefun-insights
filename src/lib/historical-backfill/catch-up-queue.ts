/**
 * Catch-up eligibility queue — symbol cursor over a shrinking sorted eligible list (Batch 33.9).
 */

export function findQueueStartIndex(eligible: readonly string[], afterSymbol: string | null): number {
  if (!afterSymbol?.trim()) return 0;
  const marker = afterSymbol.trim().toUpperCase();
  for (let i = 0; i < eligible.length; i += 1) {
    const sym = eligible[i]!;
    if (sym === marker) return i + 1;
    if (sym > marker) return i;
  }
  return 0;
}

export function sliceEligibleQueueFromIndex(
  eligible: readonly string[],
  startIndex: number,
  scanSize: number,
): { window: readonly string[]; endIndex: number } {
  const start = Math.min(Math.max(0, startIndex), eligible.length);
  const end = Math.min(start + Math.max(0, scanSize), eligible.length);
  return { window: eligible.slice(start, end), endIndex: end };
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

export function normalizeQueueAfterSymbol(raw: string | undefined): string | null {
  const trimmed = raw?.trim().toUpperCase();
  if (!trimmed) return null;
  if (!/^[A-Z][A-Z0-9.\-]{0,11}$/.test(trimmed)) return null;
  return trimmed;
}