import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapNewsEvents } from "./events.ts";

const now = new Date("2026-07-23T15:00:00Z");
const analyzedAt = now.toISOString();

Deno.test("mapNewsEvents returns missing when null", () => {
  const r = mapNewsEvents(null, now, analyzedAt);
  assertEquals(r.quality, "missing");
});

Deno.test("mapNewsEvents drops items outside 24h window", () => {
  const old = Math.floor((now.getTime() - 48 * 60 * 60 * 1000) / 1000);
  const r = mapNewsEvents(
    [{ headline: "Old news", datetime: old, source: "X", url: "https://x/y", id: 1 }],
    now, analyzedAt,
  );
  assertEquals(r.quality, "none_qualifying");
});

Deno.test("mapNewsEvents dedupes by headline+source and keeps top 5", () => {
  const t = Math.floor((now.getTime() - 3600_000) / 1000);
  const items = Array.from({ length: 8 }, (_, i) => ({
    headline: `Story ${i}`, datetime: t - i * 60, source: "Newsy",
    url: `https://x/${i}`, id: i,
  }));
  items.push({ headline: "Story 0", datetime: t + 60, source: "Newsy", url: "https://x/dup", id: 99 });
  const r = mapNewsEvents(items, now, analyzedAt);
  assertEquals(r.quality, "ok");
  assert(r.events.length <= 5);
  const zero = r.events.find((e) => e.title === "Story 0");
  assert(zero && zero.event_id === "99");
});

Deno.test("mapNewsEvents strips non-https urls", () => {
  const t = Math.floor((now.getTime() - 3600_000) / 1000);
  const r = mapNewsEvents(
    [{ headline: "H", datetime: t, source: "S", url: "http://x/y", id: 1 }],
    now, analyzedAt,
  );
  assertEquals(r.events[0].source_url, null);
});
