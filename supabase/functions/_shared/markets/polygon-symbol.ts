/**
 * Canonical equity symbol → Polygon aggregates ticker.
 * Class shares stay dotted (`BRK.B`). A single-letter hyphen suffix (`BRK-B`)
 * is the same share class in provider format, not a different symbol.
 * Anything else is rejected rather than rewritten.
 */

const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;
const CLASS_HYPHEN_RE = /^([A-Z]{1,5})-([A-Z])$/;

export function polygonEquityTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed || !TICKER_RE.test(trimmed)) return null;
  const classShare = CLASS_HYPHEN_RE.exec(trimmed);
  if (classShare) return `${classShare[1]}.${classShare[2]}`;
  return trimmed;
}
