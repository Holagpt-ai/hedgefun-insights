import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fillGroupedCache,
  GROUPED_BASE,
  groupedUrl,
  parseGroupedResults,
} from "./grouped.ts";

Deno.test("groupedUrl explicitly requests adjusted=true", () => {
  const url = groupedUrl("2026-08-12");
  assertEquals(url, `${GROUPED_BASE}/2026-08-12?adjusted=true`);
  const parsed = new URL(url);
  assertEquals(parsed.searchParams.get("adjusted"), "true");
  assertEquals(parsed.searchParams.has("adjusted"), true);
});

Deno.test("fillGroupedCache sends adjusted=true on every provider request", async () => {
  const requested: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    requested.push(url);
    const parsed = new URL(url);
    assertEquals(parsed.searchParams.get("adjusted"), "true");
    return new Response(
      JSON.stringify({
        status: "OK",
        results: [{ T: "AAPL", h: 12, l: 4 }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const cache = new Map();
  await fillGroupedCache(["2026-08-10", "2026-08-11"], cache, {
    fetch: fetchImpl,
    apiKey: "test-key",
    sleep: () => Promise.resolve(),
  });

  assertEquals(requested.length, 2);
  for (const url of requested) {
    assertEquals(url.includes("adjusted=true"), true);
    assertEquals(url.includes("adjusted=false"), false);
    assertEquals(new URL(url).searchParams.get("adjusted"), "true");
  }
  assertEquals(cache.get("2026-08-10")?.get("AAPL"), { h: 12, l: 4 });
});

Deno.test("parseGroupedResults accepts an empty results array", () => {
  const out = parseGroupedResults({ status: "OK", results: [] });
  assertEquals(out.size, 0);
});
