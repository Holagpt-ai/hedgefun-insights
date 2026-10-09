import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildCumulativeVolumeDiagnostic } from "./cumulative-volume.ts";

Deno.test("cumulative volume diagnostic prefers provider av in resolver output", async () => {
  const result = await buildCumulativeVolumeDiagnostic({
    symbol: "TEST",
    polygonApiKey: "test-key",
    fetchFn: async () =>
      new Response(JSON.stringify({
        ticker: {
          day: { v: 1_000_000 },
          min: { av: 900_000 },
          updated: 1_700_000_000_000,
          market: { session: "regular" },
        },
      }), { status: 200 }),
  });
  assertEquals(result.resolver.source, "provider_accumulated");
  assertEquals(result.resolver.volume, 900_000);
  assertEquals(result.comparisons.resolver_over_min_av, 1);
});
