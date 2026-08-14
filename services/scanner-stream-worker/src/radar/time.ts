/**
 * Normalize provider timestamps to Unix epoch milliseconds.
 * Same magnitude bands as market-session providerTimestampMs:
 *   seconds      [1e9, 1e10)
 *   milliseconds [1e11, 1e14)
 *   microseconds [1e14, 1e17)
 *   nanoseconds  [1e17, 1e20)
 */

function finiteNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 22 || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return null;
    }
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value !== "number") return null;
  return Number.isFinite(value) ? value : null;
}

export function providerTimestampMs(raw: unknown): number | null {
  const n = finiteNumber(raw);
  if (n === null || !(n > 0)) return null;

  let ms: number;
  if (n >= 1e17 && n < 1e20) {
    ms = Math.trunc(n / 1_000_000);
  } else if (n >= 1e14 && n < 1e17) {
    ms = Math.trunc(n / 1_000);
  } else if (n >= 1e11 && n < 1e14) {
    ms = Math.trunc(n);
  } else if (n >= 1e9 && n < 1e10) {
    ms = Math.trunc(n * 1_000);
  } else {
    return null;
  }

  if (!Number.isFinite(ms) || !(ms > 0)) return null;
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 2000 || year > 2100) {
    return null;
  }
  return ms;
}

export function isoFromMs(ms: number): string | null {
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

export function finiteNonNegative(value: unknown): number | null {
  const n = finiteNumber(value);
  if (n === null || n < 0) return null;
  return n;
}

export function finitePositive(value: unknown): number | null {
  const n = finiteNumber(value);
  if (n === null || !(n > 0)) return null;
  return n;
}

export function isValidOhlc(
  open: number,
  high: number,
  low: number,
  close: number,
): boolean {
  if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) {
    return false;
  }
  return low <= high && low <= open && low <= close && high >= open &&
    high >= close;
}
