// Conservative catalyst story grouping for command-center presentation.
// Groups ONLY on an exact, already-present source_url. No title fuzzy-matching.

export interface CatalystGroupable {
  id: string;
  symbol: string;
  source_url: string | null;
}

export interface CatalystStoryGroup<T extends CatalystGroupable> {
  /** Stable presentation key. */
  key: string;
  primary: T;
  symbols: string[];
  rows: T[];
  grouped: boolean;
}

function exactSourceUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  // Exact identity only — no case folding, no slash trimming, no canonicalization.
  return raw.length > 0 ? raw : null;
}

/**
 * Collapse rows that share an exact `source_url` into one story.
 * Rows without a source_url stay standalone (never merged by title).
 * First-seen backend order is preserved for both groups and member symbols.
 */
export function groupCatalystsByExactSourceUrl<T extends CatalystGroupable>(
  rows: readonly T[],
): CatalystStoryGroup<T>[] {
  const groups: CatalystStoryGroup<T>[] = [];
  const indexByUrl = new Map<string, number>();

  for (const row of rows) {
    const url = exactSourceUrl(row.source_url);
    if (url === null) {
      groups.push({
        key: `id:${row.id}`,
        primary: row,
        symbols: [row.symbol],
        rows: [row],
        grouped: false,
      });
      continue;
    }

    const existing = indexByUrl.get(url);
    if (existing === undefined) {
      indexByUrl.set(url, groups.length);
      groups.push({
        key: `url:${url}`,
        primary: row,
        symbols: [row.symbol],
        rows: [row],
        grouped: false,
      });
      continue;
    }

    const group = groups[existing];
    group.rows.push(row);
    if (!group.symbols.includes(row.symbol)) group.symbols.push(row.symbol);
    group.grouped = group.rows.length > 1;
  }

  return groups;
}
