export interface NewsFeedContinuation {
  feed_content_hash: string;
  next_item_index: number;
  feed_item_count: number;
}

export const NEWS_CONTINUATION_METADATA_KEY = "news_feed_continuation";

export function readNewsContinuation(metadata: Record<string, unknown>): NewsFeedContinuation | null {
  const raw = metadata[NEWS_CONTINUATION_METADATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const feed_content_hash = typeof row.feed_content_hash === "string" ? row.feed_content_hash : "";
  const next_item_index = typeof row.next_item_index === "number" ? row.next_item_index : Number(row.next_item_index);
  const feed_item_count = typeof row.feed_item_count === "number" ? row.feed_item_count : Number(row.feed_item_count);
  if (!feed_content_hash || !Number.isFinite(next_item_index) || !Number.isFinite(feed_item_count)) return null;
  if (next_item_index < 0 || feed_item_count < 1 || next_item_index > feed_item_count) return null;
  return { feed_content_hash, next_item_index, feed_item_count };
}

export function writeNewsContinuation(
  metadata: Record<string, unknown>,
  state: NewsFeedContinuation | null,
): Record<string, unknown> {
  const next = { ...metadata };
  if (!state || state.next_item_index >= state.feed_item_count) {
    delete next[NEWS_CONTINUATION_METADATA_KEY];
    return next;
  }
  next[NEWS_CONTINUATION_METADATA_KEY] = state;
  return next;
}

export function continuationForFeed(
  metadata: Record<string, unknown>,
  feedContentHash: string,
  feedItemCount: number,
): { startIndex: number; state: NewsFeedContinuation | null } {
  const existing = readNewsContinuation(metadata);
  if (!existing || existing.feed_content_hash !== feedContentHash) {
    return {
      startIndex: 0,
      state: { feed_content_hash: feedContentHash, next_item_index: 0, feed_item_count: feedItemCount },
    };
  }
  return { startIndex: existing.next_item_index, state: existing };
}
