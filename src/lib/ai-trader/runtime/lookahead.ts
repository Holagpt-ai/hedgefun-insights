export function evidenceIsNotFromFuture(observedAt: string | null, cycleNowMs: number): boolean {
  if (observedAt == null) return true;
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return false;
  return observedMs <= cycleNowMs;
}

export function rejectFutureForwardOutcome(
  cycleNowMs: number,
  evaluationHorizonEndMs: number,
): boolean {
  return cycleNowMs < evaluationHorizonEndMs;
}
