import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  mapMassiveFloat,
  rememberFloatIfCacheable,
  resolveFloatProviderResult,
  type MassiveFloatRecord,
} from "./float.ts";

Deno.test("maps verified Massive float and ignores outstanding shares", () => {
  const mapped = mapMassiveFloat("AAPL", {
    status: "OK",
    results: {
      ticker: "AAPL",
      float: 15_100_000_000,
      outstanding_shares: 15_500_000_000,
      as_of: "2026-09-01",
    },
  });
  assertEquals(mapped.float, 15_100_000_000);
  assertEquals(mapped.as_of, "2026-09-01");
  assertEquals(mapped.source, "massive_float");
});

Deno.test("missing or non-positive float stays unavailable", () => {
  assertEquals(mapMassiveFloat("AAA", { results: { outstanding_shares: 1_000_000 } }).float, null);
  assertEquals(mapMassiveFloat("AAA", { results: { float: 0 } }).float, null);
  assertEquals(mapMassiveFloat("AAA", null).float, null);
});

Deno.test("successful Float is cacheable", () => {
  const cache = new Map<string, MassiveFloatRecord>();
  const result = resolveFloatProviderResult("AAA", { ok: true, status: 200 }, {
    results: { ticker: "AAA", float: 2_400_000, as_of: "2026-09-01" },
  });
  rememberFloatIfCacheable(cache, "AAA", result);
  assertEquals(result.cache, true);
  assertEquals(cache.get("AAA")?.float, 2_400_000);
});

Deno.test("valid successful null Float is cacheable and stays unavailable", () => {
  const cache = new Map<string, MassiveFloatRecord>();
  const result = resolveFloatProviderResult("AAA", { ok: true, status: 200 }, {
    results: { ticker: "AAA", outstanding_shares: 5_000_000 },
  });
  rememberFloatIfCacheable(cache, "AAA", result);
  assertEquals(result.cache, true);
  assertEquals(result.data.float, null);
  assertEquals(cache.get("AAA")?.float, null);
});

Deno.test("429 and 500 are not long-cached and a later success can recover", () => {
  const cache = new Map<string, MassiveFloatRecord>();

  for (const status of [429, 500, 401]) {
    const failed = resolveFloatProviderResult("AAA", { ok: false, status }, null);
    rememberFloatIfCacheable(cache, "AAA", failed);
    assertEquals(failed.cache, false);
    assertEquals(failed.data.float, null);
    assertEquals(cache.has("AAA"), false);
  }

  const recovered = resolveFloatProviderResult("AAA", { ok: true, status: 200 }, {
    results: { ticker: "AAA", float: 2_400_000 },
  });
  rememberFloatIfCacheable(cache, "AAA", recovered);
  assertEquals(recovered.cache, true);
  assertEquals(cache.get("AAA")?.float, 2_400_000);
});
