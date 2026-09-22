import type { SecurityId } from "@/types/security-identity";

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]*$/;

export type RadarSecurityIdResolver = (
  symbol: string,
) => Promise<SecurityId | null>;

export function normalizeRadarSymbol(symbol: string): string | null {
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed || !SYMBOL_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Point lookup by permanent `securities.current_symbol` (read-only).
 * Does not create or mutate identity records.
 */
export function createSupabaseSecurityIdResolver(input: {
  lookupByCurrentSymbol(symbol: string): Promise<{ security_id: string }[] | null>;
}): RadarSecurityIdResolver {
  return async (symbol) => {
    const normalized = normalizeRadarSymbol(symbol);
    if (!normalized) return null;
    const rows = await input.lookupByCurrentSymbol(normalized);
    if (!rows || rows.length !== 1) return null;
    return rows[0]?.security_id ?? null;
  };
}
