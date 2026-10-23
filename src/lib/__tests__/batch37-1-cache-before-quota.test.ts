import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("batch37.1 cache-before-quota and provenance", () => {
  it("checks shared Redis before quota latch on memory miss", () => {
    const source = readFileSync("supabase/functions/_shared/market-data/shared-market-cache.ts", "utf8");
    expect(source).toMatch(/readSharedPayload/);
    expect(source).not.toMatch(/latch\.blocked[\s\S]{0,120}inflight\.get/);
  });

  it("exposes separate provider delay and cache freshness headers", () => {
    const provenance = readFileSync("supabase/functions/_shared/market-data/market-data-provenance.ts", "utf8");
    expect(provenance).toMatch(/X-Market-Data-Cache-Freshness/);
    expect(provenance).toMatch(/X-Market-Data-Provider-Delay/);
    expect(provenance).toMatch(/X-Market-Data-Market-Session/);
    expect(provenance).toMatch(/Never infer provider delay from cache age/);
  });

  it("keeps shared upstream caps at 18/8", () => {
    const quota = readFileSync("supabase/functions/_shared/market-data/distributed-quota.ts", "utf8");
    expect(quota).toMatch(/snapshotPerWindow:\s*18/);
    expect(quota).toMatch(/aggregatesPerWindow:\s*8/);
  });
});
