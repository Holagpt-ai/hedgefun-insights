export interface HandoffContextRow {
  key: string;
  symbol: string;
  source: string;
  title: string;
}

/**
 * Rows for a scanner handoff symbol. The URL event is not an input and cannot
 * create a row.
 */
export function selectActionCenterHandoffRows(input: {
  symbol: string | null;
  feed: ReadonlyArray<{ key: string; symbol: string; title: string; sourceLabel: string }>;
  leaders: ReadonlyArray<{ symbol: string }>;
}): HandoffContextRow[] {
  const symbol = input.symbol?.trim().toUpperCase() ?? "";
  if (!symbol) return [];
  const rows: HandoffContextRow[] = [];
  for (const item of input.feed) {
    if (item.symbol.toUpperCase() !== symbol) continue;
    if (!item.title.trim()) continue;
    rows.push({
      key: item.key,
      symbol,
      source: item.sourceLabel,
      title: item.title,
    });
  }
  if (input.leaders.some((row) => row.symbol.toUpperCase() === symbol)) {
    rows.push({
      key: `leader:${symbol}`,
      symbol,
      source: "Volume leader",
      title: symbol,
    });
  }
  return rows;
}
