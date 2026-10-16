const CONFLICT_MS = 48 * 60 * 60 * 1000;

export function schedulesMateriallyConflict(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  if (!left || !right) return false;
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) > CONFLICT_MS;
}
