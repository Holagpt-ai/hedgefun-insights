/** True while the batched catalyst enrichment query has not produced a payload yet. */
export function isCatalystEnrichmentQueryPending(input: {
  symbolCount: number;
  isPending: boolean;
  isFetching: boolean;
  hasData: boolean;
}): boolean {
  if (input.symbolCount <= 0) return false;
  return input.isPending || (input.isFetching && !input.hasData);
}
