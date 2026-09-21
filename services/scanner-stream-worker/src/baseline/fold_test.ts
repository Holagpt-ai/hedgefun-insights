import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildBaselinePublication,
  createDailyCache,
  runBaselineJob,
} from "./builder.ts";
import { createBaselineFold } from "./fold.ts";
import type { BarHL, DailyCache } from "./grouped.ts";
import { groupedUrl } from "./grouped.ts";
import type { VolumeHistoryRow } from "./persist.ts";
import { buildVolumeHistoryFromCache } from "./volume-history.ts";

function isoDay(offset: number): string {
  const ms = Date.parse("2024-01-02T00:00:00.000Z") + offset * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function gc(): void {
  const run = (globalThis as { gc?: () => void }).gc;
  if (run) run();
}

Deno.test("fold matches cache publication and volume history", async () => {
  const dates = ["2026-08-10", "2026-08-11", "2026-08-12"];
  const cache: DailyCache = new Map([
    ["2026-08-10", new Map<string, BarHL>([
      ["MSFT", { h: 30, l: 20, v: 5 }],
      ["AAPL", { h: 10, l: 8, v: 100 }],
      ["AMD", { h: 4, l: 3, v: null }],
      ["ZERO", { h: 2, l: 1, v: 0 }],
    ])],
    ["2026-08-11", new Map<string, BarHL>([
      ["AAPL", { h: 9, l: 7, v: 80 }],
      ["AMD", { h: 3, l: 2, v: 10 }],
    ])],
    ["2026-08-12", new Map<string, BarHL>([
      ["AAPL", { h: 11, l: 6, v: 50 }],
    ])],
  ]);
  const providerAsOf = "2026-08-12T20:00:00.000Z";
  const expected = buildBaselinePublication(
    cache,
    dates[0],
    dates[2],
    2,
    providerAsOf,
  );
  const expectedVolume = buildVolumeHistoryFromCache(
    cache,
    dates,
    dates[0],
    dates[2],
  );
  const fold = createBaselineFold(dates[0], dates[2], 2, dates);
  for (const date of dates) {
    const day = cache.get(date);
    if (day) fold.addDay(date, day);
  }
  const folded = fold.finish(providerAsOf);
  assertEquals(folded.rows, expected.rows);
  assertEquals(folded.exclusions, expected.exclusions);
  const volume: VolumeHistoryRow[] = [];
  const status = await folded.writeVolumeHistory(async (chunk) => {
    assert(chunk.length <= 2000);
    volume.push(...chunk);
    return "ok";
  });
  assertEquals(status, "ok");
  assertEquals(volume, expectedVolume);
  assertEquals(folded.retainedVolumeSamples, expectedVolume.length);
});

Deno.test("baseline job releases grouped days instead of retaining the cache", async () => {
  const cache = createDailyCache();
  const nowMs = Date.parse("2026-08-12T20:00:01.000Z");
  await runBaselineJob({
    nowMs: () => nowMs,
    fetch: async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      assertEquals(url, groupedUrl("2026-08-12"));
      return new Response(
        JSON.stringify({
          results: [{ T: "AAPL", h: 12, l: 4, v: 1000 }],
        }),
        { status: 200 },
      );
    },
    polygonApiKey: "test-key",
    publish: {
      async start() {
        return { error: null };
      },
      async appendRows() {
        return { error: null };
      },
      async appendExclusions() {
        return { error: null };
      },
      async appendVolumeHistory() {
        return { error: null };
      },
      async finalize() {
        return { error: null };
      },
    },
    loadState: async () => ({
      current_generation_id: null,
      status: "initializing",
      period_start: null,
      period_end: null,
      symbol_count: 0,
      provider_as_of: null,
    }),
    loadExceptions: async () => [],
    minSessions: 1,
    lookbackCalendarDays: 1,
    cache,
    lastSuccessfulPeriodEnd: null,
    newGenerationId: () => "11111111-2222-3333-4444-555555555555",
    sleep: () => Promise.resolve(),
  });
  assertEquals(cache.size, 0);
});

Deno.test("year-scale fold stays below a retained day-map cache", () => {
  const days = 120;
  const symbolCount = 2500;
  const dates = Array.from({ length: days }, (_, i) => isoDay(i));
  const periodStart = dates[0];
  const periodEnd = dates[dates.length - 1];

  gc();
  const beforeOld = Deno.memoryUsage().heapUsed;
  const cache: DailyCache = new Map();
  for (let d = 0; d < days; d++) {
    const day = new Map<string, BarHL>();
    for (let s = 0; s < symbolCount; s++) {
      day.set(`S${s}`, { h: 500 - d, l: 1 + (s % 5), v: 1_000 + s });
    }
    cache.set(dates[d], day);
  }
  gc();
  const oldHeap = Deno.memoryUsage().heapUsed - beforeOld;
  cache.clear();
  gc();

  const beforeNew = Deno.memoryUsage().heapUsed;
  const fold = createBaselineFold(periodStart, periodEnd, 1, dates);
  for (let d = 0; d < days; d++) {
    const day = new Map<string, BarHL>();
    for (let s = 0; s < symbolCount; s++) {
      day.set(`S${s}`, { h: 500 - d, l: 1 + (s % 5), v: 1_000 + s });
    }
    fold.addDay(dates[d], day);
  }
  gc();
  const newHeap = Deno.memoryUsage().heapUsed - beforeNew;
  const folded = fold.finish("2024-06-01T00:00:00.000Z");
  assertEquals(folded.rows.length, symbolCount);
  assertEquals(folded.retainedVolumeSamples, days * symbolCount);
  const hasGc = typeof (globalThis as { gc?: unknown }).gc === "function";
  if (!hasGc) return;
  assert(oldHeap > 20_000_000, `old cache heap ${oldHeap}`);
  assert(
    newHeap * 2 < oldHeap,
    `fold heap ${newHeap} vs day-map heap ${oldHeap}`,
  );
});
