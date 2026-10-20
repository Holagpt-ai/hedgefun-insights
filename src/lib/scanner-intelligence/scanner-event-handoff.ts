/**
 * Consistent scanner event extraction for qualification surfaces (Morning Opportunity, etc.).
 * Preserves active/inactive semantics from persisted scanner_events snapshots.
 */

export function collectScannerEventTypes(row: {
  scanner_events?: unknown;
  primary_scanner_event?: string | null;
}): string[] {
  const rawEvents = Array.isArray(row.scanner_events) ? row.scanner_events : [];
  const active: string[] = [];
  const seenActive = new Set<string>();

  for (const item of rawEvents) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.active === false) continue;
    const type = typeof record.type === "string" ? record.type.trim() : "";
    if (!type) continue;
    const key = type.toUpperCase();
    if (seenActive.has(key)) continue;
    seenActive.add(key);
    active.push(type);
  }

  const primary = row.primary_scanner_event?.trim();
  if (!primary) return active;

  const primaryKey = primary.toUpperCase();
  const explicitlyInactive = rawEvents.some((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    if (record.active !== false) return false;
    const type = typeof record.type === "string" ? record.type.trim().toUpperCase() : "";
    return type === primaryKey;
  });

  if (explicitlyInactive) return active;
  if (seenActive.has(primaryKey)) return active;

  // Orphan primary only when the event list is empty (legacy rows) or lists no active types.
  if (rawEvents.length === 0 || active.length === 0) {
    active.push(primary);
  }

  return active;
}
