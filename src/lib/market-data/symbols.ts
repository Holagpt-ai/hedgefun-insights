import { normalizeSymbol } from "@/lib/catalyst/parsers";

export function uniqueNormalizedSymbols(symbols: readonly string[]): string[] {
  return [...new Set(symbols.map((s) => normalizeSymbol(s)).filter(Boolean) as string[])].sort();
}
