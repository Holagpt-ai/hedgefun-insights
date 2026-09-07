export function finiteNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function finitePositive(value: unknown): number | null {
  const n = finiteNumber(value);
  if (n === null || !(n > 0)) return null;
  return n;
}

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  if (!s || s.length > 12) return null;
  if (!/^[A-Z][A-Z0-9.\-]*$/.test(s)) return null;
  return s;
}

export function pctChange(price: number | null, prevClose: number | null): number | null {
  if (price === null || prevClose === null || prevClose === 0) return null;
  const pct = ((price - prevClose) / prevClose) * 100;
  return Number.isFinite(pct) ? pct : null;
}

export function isoFromMs(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms) || !(ms > 0)) return null;
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}
