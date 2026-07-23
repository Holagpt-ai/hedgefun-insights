import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapNewsEvents } from "./events.ts";

const now = new Date("2026-07-23T15:00:00Z");
const analyzedAt = now.toISOString();
const TICKER = "AAPL";

Deno.test("returns missing when input is null", async () => {
  const r = await mapNewsEvents(null, now, analyzedAt, TICKER);
  assertEquals(r.quality, "missing");
  assertEquals(r.events.length, 0);
});

Deno.test("returns missing when input is not an array", async () => {
  const r = await mapNewsEvents({} as unknown, now, analyzedAt, TICKER);
  assertEquals(r.quality, "missing");
});

Deno.test("accepts a 47h-old record", async () => {
  const t = Math.floor((now.getTime() - 47 * 3600_000) / 1000);
  const r = await mapNewsEvents(
    [{ headline: "H", datetime: t, source: "S", url: "https://x/y" }],
    now, analyzedAt, TICKER,
  );
  assertEquals(r.quality, "ok");
  assertEquals(r.events.length, 1);
});

Deno.test("rejects a 49h-old record", async () => {
  const t = Math.floor((now.getTime() - 49 * 3600_000) / 1000);
  const r = await mapNewsEvents(
    [{ headline: "H", datetime: t, source: "S", url: "https://x/y" }],
    now, analyzedAt, TICKER,
  );
  assertEquals(r.quality, "none_qualifying");
});

Deno.test("rejects a >5min-future record", async () => {
  const t = Math.floor((now.getTime() + 10 * 60_000) / 1000);
  const r = await mapNewsEvents(
    [{ headline: "H", datetime: t, source: "S", url: "https://x/y" }],
    now, analyzedAt, TICKER,
  );
  assertEquals(r.quality, "none_qualifying");
});

Deno.test("rejects empty headline", async () => {
  const t = Math.floor((now.getTime() - 3600_000) / 1000);
  const r = await mapNewsEvents(
    [{ headline: "", datetime: t, source: "S", url: "https://x/y" }],
    now, analyzedAt, TICKER,
  );
  assertEquals(r.quality, "none_qualifying");
});

Deno.test("rejects empty source", async () => {
  const t = Math.floor((now.getTime() - 3600_000) / 1000);
  const r = await mapNewsEvents(
    [{ headline: "H", datetime: t, source: "", url: "https://x/y" }],
    now, analyzedAt, TICKER,
  );
  assertEquals(r.quality, "none_qualifying");
});

Deno.test("non-https url becomes source_url null", async () => {
  const t = Math.floor((now.getTime() - 3600_000) / 1000);
  const r = await mapNewsEvents(
    [{ headline: "H", datetime: t, source: "S", url: "http://x/y" }],
    now, analyzedAt, TICKER,
  );
  assertEquals(r.events[0].source_url, null);
});

Deno.test("identical ticker+epoch+normalized-headline collapse to one", async () => {
  const t = Math.floor((now.getTime() - 3600_000) / 1000);
  const r = await mapNewsEvents(
    [
      { headline: "Same story", datetime: t, source: "A", url: "https://x/1" },
      { headline: "Same story", datetime: t, source: "B", url: "https://x/2" },
    ],
    now, analyzedAt, TICKER,
  );
  assertEquals(r.events.length, 1);
});

Deno.test("whitespace/case differences still collapse", async () => {
  const t = Math.floor((now.getTime() - 3600_000) / 1000);
  const r = await mapNewsEvents(
    [
      { headline: "Big  Story  Today", datetime: t, source: "A", url: "https://x/1" },
      { headline: "big story today", datetime: t, source: "B", url: "https://x/2" },
    ],
    now, analyzedAt, TICKER,
  );
  assertEquals(r.events.length, 1);
});

Deno.test("caps at 5 events", async () => {
  const t = Math.floor((now.getTime() - 3600_000) / 1000);
  const items = Array.from({ length: 8 }, (_, i) => ({
    headline: `Story ${i}`, datetime: t - i * 60, source: "S", url: `https://x/${i}`,
  }));
  const r = await mapNewsEvents(items, now, analyzedAt, TICKER);
  assertEquals(r.events.length, 5);
});

Deno.test("sort is descending by event_time", async () => {
  const t = Math.floor((now.getTime() - 3600_000) / 1000);
  const items = [
    { headline: "Old", datetime: t - 600, source: "S", url: "https://x/1" },
    { headline: "New", datetime: t, source: "S", url: "https://x/2" },
    { headline: "Mid", datetime: t - 300, source: "S", url: "https://x/3" },
  ];
  const r = await mapNewsEvents(items, now, analyzedAt, TICKER);
  assertEquals(r.events.map((e) => e.title), ["New", "Mid", "Old"]);
});

Deno.test("verification_state is always provider_reported", async () => {
  const t = Math.floor((now.getTime() - 3600_000) / 1000);
  const r = await mapNewsEvents(
    [{ headline: "H", datetime: t, source: "S", url: "https://x/y" }],
    now, analyzedAt, TICKER,
  );
  for (const e of r.events) assertEquals(e.verification_state, "provider_reported");
});

Deno.test("zero qualifying returns none_qualifying with empty events", async () => {
  const r = await mapNewsEvents([], now, analyzedAt, TICKER);
  assertEquals(r.quality, "none_qualifying");
  assertEquals(r.events.length, 0);
});

Deno.test("event_id is deterministic SHA-256 hex", async () => {
  const t = Math.floor((now.getTime() - 3600_000) / 1000);
  const r1 = await mapNewsEvents(
    [{ headline: "Hello World", datetime: t, source: "S", url: "https://x/y" }],
    now, analyzedAt, TICKER,
  );
  const r2 = await mapNewsEvents(
    [{ headline: "hello  world", datetime: t, source: "S", url: "https://x/y" }],
    now, analyzedAt, TICKER,
  );
  assert(/^[0-9a-f]{64}$/.test(r1.events[0].event_id));
  assertEquals(r1.events[0].event_id, r2.events[0].event_id);
});
