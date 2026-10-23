import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  chunkRadarHistoricalContextRequests,
  RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS_PER_BATCH,
} from "@/lib/radar/radar-historical-context-bounds";

describe("batch37 market data and scanner capacity guards", () => {
  it("documents global shared upstream caps (not per visitor)", () => {
    const quota = readFileSync("supabase/functions/_shared/market-data/distributed-quota.ts", "utf8");
    expect(quota).toMatch(/snapshotPerWindow:\s*18/);
    expect(quota).toMatch(/aggregatesPerWindow:\s*8/);
    expect(quota).toMatch(/clientPerWindow:\s*0/);
  });

  it("shares live quote and chart payloads across isolates on L1 miss", () => {
    const index = readFileSync("supabase/functions/market-data/index.ts", "utf8");
    expect(index).toMatch(/sharePayload:\s*true,\s*\n\s*surface:\s*"quote"/);
    expect(index).toMatch(/sharePayload:\s*cacheKey != null/);
  });

  it("dedupes concurrent market-data fetches in the browser", () => {
    const polygon = readFileSync("src/lib/polygon.ts", "utf8");
    expect(polygon).toMatch(/marketDataInflight/);
    expect(polygon).toMatch(/readMarketDataClientCache/);
  });

  it("chunks radar historical enrichment above 20 symbols", () => {
    expect(RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS_PER_BATCH).toBe(20);
    const symbols = Array.from({ length: 25 }, (_, i) => `S${i}`);
    const chunks = chunkRadarHistoricalContextRequests(symbols);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(20);
    expect(chunks[1]).toHaveLength(5);
  });

  it("keeps progressive historical coordinator lifecycle guards", () => {
    const coordinator = readFileSync("src/lib/radar/radar-progressive-historical-context.ts", "utf8");
    expect(coordinator).toMatch(/lifecycleId/);
    expect(coordinator).toMatch(/pauseWhenHidden/);
    expect(coordinator).toMatch(/maxBatchesPerWake/);
  });
});
