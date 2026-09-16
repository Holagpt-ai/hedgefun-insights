import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { mapMassiveFloat } from "./float.ts";

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
