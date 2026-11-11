/** Split list vs secondary loading so symbols render before analysis/requests settle. */
export function resolveWatchlistLoadingState(input: {
  hasUser: boolean;
  symbolsListPending: boolean;
  symbolsListFetched: boolean;
  symbolCount: number;
  analysisPending: boolean;
  requestsPending: boolean;
}): {
  isListLoading: boolean;
  isSecondaryLoading: boolean;
  /** @deprecated Prefer isListLoading; kept for callers expecting the old combined flag. */
  isLoading: boolean;
} {
  if (!input.hasUser) {
    return { isListLoading: false, isSecondaryLoading: false, isLoading: false };
  }
  const isListLoading = input.hasUser && !input.symbolsListFetched && input.symbolsListPending;
  const isSecondaryLoading =
    input.symbolCount > 0 && (input.analysisPending || input.requestsPending);
  return {
    isListLoading,
    isSecondaryLoading,
    isLoading: isListLoading,
  };
}
