/** Journal new-trade supports `symbol`; optional `catalyst` prefill is read by NewTradePage. */

export function buildCalendarJournalHref(input: {
  symbol: string;
  eventTitle: string;
  eventDate: string;
}): string {
  const params = new URLSearchParams({
    symbol: input.symbol.toUpperCase(),
    catalyst: input.eventTitle.slice(0, 160),
    researchDate: input.eventDate,
  });
  return `/journal/trades/new?${params.toString()}`;
}