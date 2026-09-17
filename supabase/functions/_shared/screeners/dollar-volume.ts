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
  if (!Number.isFinite(product)) return null;
  return product;
}
