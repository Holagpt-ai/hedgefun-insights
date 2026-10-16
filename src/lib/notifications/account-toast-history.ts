/** Bounded, account-scoped local notification history (survives reload / new browser session). */

export type AccountToastHistoryEntry = { k: string; at: number };

export function readAccountToastHistory(
  storageNamespace: string,
  userId: string,
  input: { nowMs?: number; maxAgeMs: number; maxEntries: number },
): Set<string> {
  if (typeof localStorage === "undefined" || !userId.trim()) return new Set();
  const nowMs = input.nowMs ?? Date.now();
  const key = `${storageNamespace}:${userId.trim()}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
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
    return new Set(trimmed.map((e) => e.k));
  } catch {
    return new Set();
  }
}

export function markAccountToastHistory(
  storageNamespace: string,
  userId: string,
  toastKey: string,
  input: { nowMs?: number; maxAgeMs: number; maxEntries: number },
): void {
  if (typeof localStorage === "undefined" || !userId.trim() || !toastKey.trim()) return;
  const nowMs = input.nowMs ?? Date.now();
  const storageKey = `${storageNamespace}:${userId.trim()}`;
  const seen = readAccountToastHistory(storageNamespace, userId, input);
  seen.add(toastKey);
  const entries: AccountToastHistoryEntry[] = [...seen].map((k) => ({ k, at: nowMs }));
  const trimmed = entries.slice(-input.maxEntries);
  try {
    localStorage.setItem(storageKey, JSON.stringify(trimmed));
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
