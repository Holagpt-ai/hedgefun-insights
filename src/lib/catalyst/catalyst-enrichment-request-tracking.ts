/** Drop in-flight markers for targets that were cancelled before completion. */
export function clearCancelledEnrichmentInflight(
  targets: readonly string[],
  completed: ReadonlySet<string>,
  inFlight: Set<string>,
): readonly string[] {
  const interrupted: string[] = [];
  for (const symbol of targets) {
    if (completed.has(symbol)) continue;
    if (inFlight.delete(symbol)) interrupted.push(symbol);
  }
  return interrupted;
}
