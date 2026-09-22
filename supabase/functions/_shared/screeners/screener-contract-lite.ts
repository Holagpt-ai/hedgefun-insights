export function parseTimestampMs(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function computeDollarVolume(
  price: number | null | undefined,
  volume: number | null | undefined,
): number | null {
  if (!isPositiveFinite(price)) return null;
  if (!isFiniteNumber(volume) || volume < 0) return null;
  const product = price * volume;
  return Number.isFinite(product) ? product : null;
}
