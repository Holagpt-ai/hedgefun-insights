/** Canonical scanner alert identity (matches Edge `scannerAlertDedupeKey` shape). */

const CANONICAL_DEDUPE_KEY_PATTERN =
  /^scanner_v1:\d{4}-\d{2}-\d{2}:[^:]+:[A-Z0-9_]+:.+$/i;

export function isCanonicalScannerAlertDedupeKey(
  dedupeKey: string | null | undefined,
): boolean {
  if (typeof dedupeKey !== "string") return false;
  const trimmed = dedupeKey.trim();
  if (!trimmed) return false;
  return CANONICAL_DEDUPE_KEY_PATTERN.test(trimmed);
}

/**
 * Toast/history identity: canonical event when available, else persisted row id.
 */
export function scannerAlertCanonicalToastKey(row: {
  id: string;
  dedupe_key: string;
}): string {
  const dedupe = row.dedupe_key?.trim() ?? "";
  if (isCanonicalScannerAlertDedupeKey(dedupe)) return dedupe;
  const id = row.id?.trim() ?? "";
  if (id) return id;
  return dedupe;
}

export function dedupeScannerAlertsByCanonicalIdentity<
  T extends { id: string; dedupe_key: string },
>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = scannerAlertCanonicalToastKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
