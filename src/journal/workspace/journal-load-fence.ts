/** Guards async Journal loads against user switches and stale responses. */
export function shouldApplyJournalLoad(
  expectedUserId: string,
  expectedGeneration: number,
  activeUserId: string | null,
  activeGeneration: number,
): boolean {
  return activeUserId === expectedUserId && activeGeneration === expectedGeneration;
}

export function nextJournalLoadGeneration(current: number): number {
  return current + 1;
}
