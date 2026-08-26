// Presentation-layer rollup of Risk & Attention items by ticker.
// Does not invent conclusions — callers render the supplied labels/details.

export interface AttentionGroupable {
  id: string;
  symbol: string | null;
  label: string;
  detail: string | null;
  route: string | null;
}

export interface AttentionTickerGroup<T extends AttentionGroupable> {
  key: string;
  symbol: string | null;
  items: T[];
  route: string | null;
}

/**
 * Group ticker-bearing items by exact symbol (first-seen order).
 * Symbol-less items remain standalone so they are not silently merged.
 */
export function groupAttentionBySymbol<T extends AttentionGroupable>(
  items: readonly T[],
): AttentionTickerGroup<T>[] {
  const groups: AttentionTickerGroup<T>[] = [];
  const indexBySymbol = new Map<string, number>();

  for (const item of items) {
    const symbol = typeof item.symbol === "string" && item.symbol.length > 0 ? item.symbol : null;
    if (symbol === null) {
      groups.push({
        key: `id:${item.id}`,
        symbol: null,
        items: [item],
        route: item.route,
      });
      continue;
    }

    const existing = indexBySymbol.get(symbol);
    if (existing === undefined) {
      indexBySymbol.set(symbol, groups.length);
      groups.push({
        key: `sym:${symbol}`,
        symbol,
        items: [item],
        route: item.route,
      });
      continue;
    }

    groups[existing].items.push(item);
  }

  return groups;
}

/** Deterministic lines from supplied labels/details. Never synthesizes a new thesis. */
export function attentionDetailLines<T extends AttentionGroupable>(
  items: readonly T[],
): string[] {
  const lines: string[] = [];
  for (const item of items) {
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const detail = typeof item.detail === "string" ? item.detail.trim() : "";
    if (label && detail && detail !== label) lines.push(`${label} — ${detail}`);
    else if (label) lines.push(label);
    else if (detail) lines.push(detail);
  }
  return lines;
}
