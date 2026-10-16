/** Bounded, account-scoped local notification history (survives reload / new browser session). */

export type AccountToastHistoryEntry = { k: string; at: number };

function storageKeyForUser(storageNamespace: string, userId: string): string {
  return `${storageNamespace}:${userId.trim()}`;
}

export function readAccountToastHistoryEntries(
  storageNamespace: string,
  userId: string,
  input: { nowMs?: number; maxAgeMs: number; maxEntries: number },
): AccountToastHistoryEntry[] {
  if (typeof localStorage === "undefined" || !userId.trim()) return [];
  const nowMs = input.nowMs ?? Date.now();
  const key = storageKeyForUser(storageNamespace, userId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const entries: AccountToastHistoryEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const k = (item as AccountToastHistoryEntry).k;
      const at = (item as AccountToastHistoryEntry).at;
      if (typeof k !== "string" || typeof at !== "number") continue;
      if (nowMs - at > input.maxAgeMs) continue;
      entries.push({ k, at });
    }
    const trimmed = entries.slice(-input.maxEntries);
    if (trimmed.length !== parsed.length) {
      localStorage.setItem(key, JSON.stringify(trimmed));
    }
    return trimmed;
  } catch {
    return [];
  }
}

export function readAccountToastHistory(
  storageNamespace: string,
  userId: string,
  input: { nowMs?: number; maxAgeMs: number; maxEntries: number },
): Set<string> {
  return new Set(readAccountToastHistoryEntries(storageNamespace, userId, input).map((e) => e.k));
}

export function markAccountToastHistory(
  storageNamespace: string,
  userId: string,
  toastKey: string,
  input: { nowMs?: number; maxAgeMs: number; maxEntries: number },
): void {
  if (typeof localStorage === "undefined" || !userId.trim() || !toastKey.trim()) return;
  const nowMs = input.nowMs ?? Date.now();
  const key = storageKeyForUser(storageNamespace, userId);
  const existing = readAccountToastHistoryEntries(storageNamespace, userId, input);
  const byKey = new Map(existing.map((entry) => [entry.k, entry]));
  byKey.set(toastKey, { k: toastKey, at: nowMs });
  const merged = [...byKey.values()].filter((entry) => nowMs - entry.at <= input.maxAgeMs);
  const trimmed = merged.slice(-input.maxEntries);
  try {
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch {
    // quota / privacy mode
  }
}

export function mergeToastSeenSets(...sets: ReadonlySet<string>[]): Set<string> {
  const out = new Set<string>();
  for (const set of sets) {
    for (const id of set) out.add(id);
  }
  return out;
}
