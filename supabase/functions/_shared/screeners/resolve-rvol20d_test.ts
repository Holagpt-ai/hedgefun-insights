import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveRvol20dFromSources } from "./resolve-rvol20d.ts";
import type { VolumeBaselineQuote } from "./volume-baseline.ts";

const baseline = (overrides: Partial<VolumeBaselineQuote> = {}): VolumeBaselineQuote => ({
  symbol: "AAA",
  avg_volume_20d: 2_000_000,
  volume_sessions_used: 20,
  window_start_date: "2026-09-01",
  window_end_date: "2026-09-17",
  ...overrides,
});

Deno.test("1. sufficient history + valid baseline returns RVOL", () => {
  const baselines = new Map([["AAA", baseline()]]);
  assertEquals(
    resolveRvol20dFromSources({
      volume: 10_000_000,
      symbol: "AAA",
      baselines,
      tradingDate: "2026-09-18",
    }),
    5,
  );
});

Deno.test("2. missing baseline returns unavailable", () => {
  assertEquals(
    resolveRvol20dFromSources({
      volume: 10_000_000,
      symbol: "ZZZ",
      baselines: new Map(),
      tradingDate: "2026-09-18",
    }),
    null,
  );
});

Deno.test("3. missing history via self-inclusive window returns unavailable", () => {
  const baselines = new Map([
    ["AAA", baseline({ window_end_date: "2026-09-18" })],
  ]);
  assertEquals(
    resolveRvol20dFromSources({
      volume: 10_000_000,
      symbol: "AAA",
      baselines,
      tradingDate: "2026-09-18",
    }),
    null,
  );
});

Deno.test("4. generation mismatch via absent symbol baseline returns unavailable", () => {
  const baselines = new Map([["OTHER", baseline({ symbol: "OTHER" })]]);
  assertEquals(
    resolveRvol20dFromSources({
      volume: 10_000_000,
      symbol: "AAA",
      baselines,
      tradingDate: "2026-09-18",
    }),
    null,
  );
});

Deno.test("5. persisted rvol_20d snapshot preferred over baseline recompute", () => {
  const baselines = new Map([["AAA", baseline()]]);
  assertEquals(
    resolveRvol20dFromSources({
      volume: 10_000_000,
      symbol: "AAA",
      persistedRvol20d: 3.25,
      baselines,
      tradingDate: "2026-09-18",
    }),
    3.25,
  );
});

Deno.test("6. zero baseline protection returns unavailable", () => {
  const baselines = new Map([
    ["AAA", baseline({ avg_volume_20d: 0 })],
  ]);
  assertEquals(
    resolveRvol20dFromSources({
      volume: 10_000_000,
      symbol: "AAA",
      baselines,
      tradingDate: "2026-09-18",
    }),
    null,
  );
});
