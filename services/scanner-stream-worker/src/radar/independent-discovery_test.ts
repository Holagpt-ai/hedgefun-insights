import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createRadarEngine } from "./engine.ts";
import { mergeRadarConfig } from "./config.ts";
import type { EligibleQuote } from "./types.ts";

const T0 = Date.parse("2026-08-10T14:00:00.000Z");
const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function agg(sym: string, s: number, v: number, c: number): Record<string, unknown> {
  return {
    ev: "A",
    sym,
    v,
    av: v * 20,
    op: c,
    vw: c,
    o: c,
    c,
    h: c,
    l: c,
    a: c,
    z: 10,
    s,
    e: s + 1_000,
  };
}

function quote(symbol: string, price: number): EligibleQuote {
  return {
    symbol,
    companyName: symbol,
    regularClose: price,
    previousClose: price * 0.8,
    dayVolume: 2_000_000,
    priorVolume: 500_000,
    dayHigh: price * 1.1,
    dayLow: price * 0.8,
    volumeRatio: 4,
    changePercent: 20,
  };
}

function universe(quotes: EligibleQuote[]): Map<string, EligibleQuote> {
  return new Map(quotes.map((q) => [q.symbol, q]));
}

Deno.test("penny outside main promotion cap uses discovery track without Five Pillars", () => {
  const engine = createRadarEngine({
    config: mergeRadarConfig({
      sentinelEnabled: true,
      promotionCap: 1,
      discoveryTrackCap: 4,
    }),
    exceptions: [],
  });
  engine.setUniverse(universe([quote("MAIN", 5), quote("PENNY", 0.8)]));
  for (let i = 0; i < 70; i++) {
    const s = T0 + i * 1_000;
    engine.ingest(agg("MAIN", s, 20_000, 5), s);
    engine.ingest(agg("PENNY", s, 20_000, 0.8), s);
  }
  const result = engine.evaluate(T0 + 80_000, GEN);
  const symbols = result.persistenceV2.candidates.map((row) => row.symbol);
  assertEquals(symbols.includes("MAIN"), true);
  assertEquals(symbols.includes("PENNY"), true);
  assertEquals(engine.isPromoted("MAIN"), true);
  assertEquals(engine.isPromoted("PENNY"), false);
  assertEquals(engine.isDiscoveryTracked("PENNY"), true);
  assertEquals(engine.sentinelStats().promoted, 1);
});

Deno.test("breakout scanner events can persist for discovery-tracked symbol", () => {
  const engine = createRadarEngine({
    config: mergeRadarConfig({
      sentinelEnabled: true,
      promotionCap: 1,
      discoveryTrackCap: 4,
    }),
    exceptions: [],
  });
  engine.setUniverse(universe([quote("MAIN", 5), quote("BRK", 8)]));
  for (let i = 0; i < 90; i++) {
    const s = T0 + i * 1_000;
    engine.ingest(agg("MAIN", s, 25_000, 5), s);
    const px = 8 + i * 0.01;
    engine.ingest(agg("BRK", s, 25_000, px), s);
  }
  const result = engine.evaluate(T0 + 100_000, GEN);
  const brk = result.persistenceV2.candidates.find((row) => row.symbol === "BRK");
  assertEquals(Boolean(brk), true);
  assertEquals(engine.isDiscoveryTracked("BRK"), true);
});
