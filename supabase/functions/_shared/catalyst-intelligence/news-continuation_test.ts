import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  continuationForFeed,
  hasPendingNewsArticles,
  readNewsContinuation,
  writeNewsContinuation,
} from "./news-continuation.ts";

Deno.test("news continuation resumes index when feed hash changes but backlog remains", () => {
  const metadata = writeNewsContinuation({}, {
    feed_content_hash: "hash-a",
    next_item_index: 16,
    feed_item_count: 40,
  });
  const plan = continuationForFeed(metadata, "hash-b", 40);
  assertEquals(plan.startIndex, 16);
  assertEquals(plan.state?.feed_content_hash, "hash-b");
  assertEquals(plan.state?.next_item_index, 16);
  assertEquals(plan.state?.feed_item_count, 40);
});

Deno.test("news continuation resets when hash changes and prior drain was complete", () => {
  const metadata = writeNewsContinuation({}, {
    feed_content_hash: "hash-a",
    next_item_index: 40,
    feed_item_count: 40,
  });
  const cleared = writeNewsContinuation(metadata, null);
  const plan = continuationForFeed(cleared, "hash-b", 12);
  assertEquals(plan.startIndex, 0);
  assertEquals(plan.state?.next_item_index, 0);
});

Deno.test("hasPendingNewsArticles true when parsed feed is shorter than stored cursor", () => {
  const metadata = writeNewsContinuation({}, {
    feed_content_hash: "hash-a",
    next_item_index: 20,
    feed_item_count: 40,
  });
  assertEquals(hasPendingNewsArticles(metadata, "hash-a", 8), true);
  assertEquals(hasPendingNewsArticles(metadata, "hash-a", 20), true);
  assertEquals(hasPendingNewsArticles(metadata, "hash-a", 40), true);
  const done = writeNewsContinuation({}, {
    feed_content_hash: "hash-a",
    next_item_index: 40,
    feed_item_count: 40,
  });
  assertEquals(hasPendingNewsArticles(writeNewsContinuation(done, null), "hash-a", 40), false);
});

Deno.test("hasPendingNewsArticles survives hash mismatch while backlog remains", () => {
  const metadata = writeNewsContinuation({}, {
    feed_content_hash: "hash-a",
    next_item_index: 8,
    feed_item_count: 40,
  });
  assertEquals(hasPendingNewsArticles(metadata, "hash-b", 0), true);
});
