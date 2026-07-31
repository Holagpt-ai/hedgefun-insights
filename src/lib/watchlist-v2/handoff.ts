const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;

/** Normalize a raw query symbol to canonical form, or null when invalid. */
export function normalizeHandoffSymbol(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  return SYMBOL_RE.test(t) ? t : null;
}
