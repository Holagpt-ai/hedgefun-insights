/** Display helpers for persisted scanner event types. */

export const SCANNER_EVENT_LABELS = {
  HOD_BREAK: "HOD BREAK",
  HOD_MOMENTUM: "HOD MOMENTUM",
  RUNNING_UP: "RUNNING UP",
  VWAP_RECLAIM: "VWAP RECLAIM",
  GAP_CONTINUATION: "GAP CONTINUATION",
  LATE_DAY_ACCELERATION: "LATE DAY ACCELERATION",
  VOLUME_EXPLOSION: "VOLUME EXPLOSION",
  VWAP_LOSS: "VWAP LOSS",
} as const;

export type ScannerEventLabelKey = keyof typeof SCANNER_EVENT_LABELS;

export function formatScannerEventLabel(
  type: string | null | undefined,
): string | null {
  if (!type) return null;
  return (SCANNER_EVENT_LABELS as Record<string, string>)[type] ?? null;
}

export function resolveScannerSignalLabel(input: {
  primaryScannerEvent: string | null | undefined;
  fallbackSignal: string;
}): string {
  return formatScannerEventLabel(input.primaryScannerEvent) ?? input.fallbackSignal;
}
