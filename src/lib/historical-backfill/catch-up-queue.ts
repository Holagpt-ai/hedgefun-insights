/**
 * Catch-up eligibility queue — symbol cursor over a shrinking sorted eligible list.
 * Batch 33.9 + Nov 27 starvation completion: exclusive advance past deferred belts,
 * wrap-once exhaustion, and stable fingerprints for campaign stuck-cursor halt.
 */

export function normalizeEligibleSymbols(symbols: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of symbols) {
    const s = (raw ?? "").trim().toUpperCase();
    if (s) out.add(s);
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

export function findQueueStartIndex(eligible: readonly string[], afterSymbol: string | null): number {
  if (!afterSymbol?.trim()) return 0;
  const marker = afterSymbol.trim().toUpperCase();
  const list = eligible;
  for (let i = 0; i < list.length; i += 1) {
    const sym = list[i]!.toUpperCase();
    if (sym === marker) return i + 1;
    if (sym > marker) return i;
  }
  // Marker is past the last eligible symbol — wrap to head on the next planner step.
  return list.length;
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

/** Exclusive resume cursor = last symbol inspected in the window (next start is after it). */
export function exclusiveCursorAfterWindow(window: readonly string[]): string | null {
  if (window.length === 0) return null;
  return window[window.length - 1]!.toUpperCase();
}

export type CatchUpQueueWindowPlan = {
  window: readonly string[];
  startIndex: number;
  endIndex: number;
  /** Exclusive cursor to persist after this window (last symbol, or prior cursor if empty). */
  nextAfterSymbol: string | null;
  wrapped: boolean;
  /** Full eligible list was traversed once without a further window. */
  exhausted: boolean;
};

/**
 * Plan the next scan window with exclusive cursor semantics and at-most-one wrap per cycle.
 * Does not permanently discard deferred symbols — they remain eligible until completed.
 */
export function planNextCatchUpQueueWindow(input: {
  eligible: readonly string[];
  afterSymbol: string | null;
  scanSize: number;
  /** True when this Fly run already wrapped once. */
  wrappedOnce: boolean;
}): CatchUpQueueWindowPlan {
  const eligible = normalizeEligibleSymbols(input.eligible);
  if (eligible.length === 0) {
    return {
      window: [],
      startIndex: 0,
      endIndex: 0,
      nextAfterSymbol: input.afterSymbol,
      wrapped: false,
      exhausted: true,
    };
  }

  let start = findQueueStartIndex(eligible, input.afterSymbol);
  let wrapped = false;

  if (start >= eligible.length) {
    if (input.wrappedOnce) {
      return {
        window: [],
        startIndex: start,
        endIndex: start,
        nextAfterSymbol: input.afterSymbol,
        wrapped: true,
        exhausted: true,
      };
    }
    start = 0;
    wrapped = true;
  }

  const sliced = sliceEligibleQueueFromIndex(eligible, start, input.scanSize);
  if (sliced.window.length === 0) {
    if (!input.wrappedOnce && !wrapped) {
      const head = sliceEligibleQueueFromIndex(eligible, 0, input.scanSize);
      return {
        window: head.window,
        startIndex: 0,
        endIndex: head.endIndex,
        nextAfterSymbol: exclusiveCursorAfterWindow(head.window) ?? input.afterSymbol,
        wrapped: true,
        exhausted: head.window.length === 0,
      };
    }
    return {
      window: [],
      startIndex: start,
      endIndex: sliced.endIndex,
      nextAfterSymbol: input.afterSymbol,
      wrapped,
      exhausted: true,
    };
  }

  return {
    window: sliced.window,
    startIndex: start,
    endIndex: sliced.endIndex,
    nextAfterSymbol: exclusiveCursorAfterWindow(sliced.window),
    wrapped,
    exhausted: false,
  };
}

/** Stable fingerprint for identical empty deferred windows (campaign stuck-cursor halt). */
export function emptyQueueWindowFingerprint(input: {
  queueAfterSymbol: string | null;
  scanned: number;
  deferredByKind: Record<string, number>;
  eligibleSymbolsRemaining: number;
}): string {
  const kinds = Object.keys(input.deferredByKind)
    .sort()
    .map((k) => `${k}:${input.deferredByKind[k]}`)
    .join(",");
  return [
    (input.queueAfterSymbol ?? "").toUpperCase(),
    String(input.scanned),
    String(input.eligibleSymbolsRemaining),
    kinds,
  ].join("|");
}
