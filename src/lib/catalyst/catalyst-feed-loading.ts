/** True only for the initial catalyst_events fetch (not background refetch with cached data). */
export function isCatalystFeedInitialLoading(
  isPending: boolean,
  hasData: boolean,
): boolean {
  return isPending && !hasData;
}
