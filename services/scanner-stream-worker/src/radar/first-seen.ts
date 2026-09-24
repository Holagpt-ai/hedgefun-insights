/**
 * Stable Radar first-seen clock.
 * Set once per symbol for the session. Later evaluations must not move it.
 */

export function rememberRadarFirstSeen(
  clock: Map<string, number>,
  symbol: string,
  eventNowMs: number,
): number {
  const existing = clock.get(symbol);
  if (existing !== undefined && Number.isFinite(existing)) return existing;
  clock.set(symbol, eventNowMs);
  return eventNowMs;
}
