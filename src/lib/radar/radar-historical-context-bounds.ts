/** Must match `supabase/functions/_shared/radar-historical-context/request-bounds.ts`. */
export const RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS_PER_BATCH = 20;

export function chunkRadarHistoricalContextRequests<T>(
  items: readonly T[],
  maxSize = RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS_PER_BATCH,
): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += maxSize) {
    chunks.push(items.slice(i, i + maxSize));
  }
  return chunks;
}
