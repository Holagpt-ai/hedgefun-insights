// Encode ticker to URL-safe slug: BRK.B → brk-b
export function tickerToSlug(ticker: string): string {
  return ticker.replace('.', '-').toLowerCase();
}

// Decode slug back to canonical ticker: brk-b → BRK.B
export function slugToTicker(slug: string): string {
  return slug.replace('-b', '.B').replace('-a', '.A').toUpperCase();
}
