// Reusable Top-N presentation helpers for AM/PM command-center surfaces.
// Pure and session-agnostic — no ranking, no data fetching.

export const DEFAULT_REVEAL_LIMIT = 3;

export interface RevealSlice<T> {
  visible: T[];
  total: number;
  hiddenCount: number;
  canReveal: boolean;
}

/**
 * Return the default Top-N slice, or the full list when expanded.
 * Backend order is preserved. Excess items are never dropped from `items`.
 */
export function sliceForReveal<T>(
  items: readonly T[],
  expanded: boolean,
  limit: number = DEFAULT_REVEAL_LIMIT,
): RevealSlice<T> {
  const list = Array.isArray(items) ? [...items] : [];
  const total = list.length;
  const cap = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_REVEAL_LIMIT;
  const canReveal = total > cap;
  const visible = expanded || !canReveal ? list : list.slice(0, cap);
  return {
    visible,
    total,
    hiddenCount: Math.max(0, total - visible.length),
    canReveal,
  };
}

export function revealToggleLabel(expanded: boolean, total: number): string {
  if (expanded) return "Show Less";
  return `View All (${total})`;
}
