import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ProviderUnavailableError } from "./provider.ts";
import {
  barsToPayload,
  groupedUrl,
  isValidHighLow,
  parseGroupedResults,
} from "./grouped-daily.ts";

Deno.test("grouped URL is adjusted=true and has no apiKey query param", () => {
  const url = groupedUrl("2026-08-11");
  assertEquals(
    url,
    "https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/2026-08-11?adjusted=true",
  );
  assertEquals(url.includes("apiKey"), false);
});

Deno.test("invalid bars are rejected and valid bars are kept", () => {
  const parsed = parseGroupedResults({
    results: [
      { T: "AAA", h: 10, l: 5 },
      { T: "BADNEG", h: -1, l: 1 },
      { T: "FLIP", h: 2, l: 9 },
      { T: "NAN", h: Number.NaN, l: 1 },
      { T: "bbb", h: 4, l: 3 },
    ],
  });
  assertEquals([...parsed.keys()].sort(), ["AAA", "BBB"]);
  assertEquals(parsed.get("AAA"), { h: 10, l: 5 });
  assertEquals(isValidHighLow(2, 9), false);
});

Deno.test("malformed grouped envelope fails closed", () => {
  assertThrows(
    () => parseGroupedResults([]),
    ProviderUnavailableError,
  );
  assertThrows(
    () => parseGroupedResults({ results: "nope" }),
    ProviderUnavailableError,
  );
});

Deno.test("missing results is an empty valid day", () => {
  const parsed = parseGroupedResults({ status: "OK" });
  assertEquals(parsed.size, 0);
});

Deno.test("barsToPayload emits one row per Map symbol", () => {
  const parsed = parseGroupedResults({
    results: [
      { T: "AAA", h: 10, l: 5 },
      { T: "AAA", h: 12, l: 4 },
      { T: "BBB", h: 8, l: 3 },
    ],
  });
  assertEquals(parsed.size, 2);
  const payload = barsToPayload(parsed);
  assertEquals(payload.length, parsed.size);
  assertEquals(new Set(payload.map((row) => row.symbol)).size, payload.length);
  assertEquals(parsed.get("AAA"), { h: 12, l: 4 });
});
