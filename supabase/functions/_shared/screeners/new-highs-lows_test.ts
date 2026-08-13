import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyNewHighLow,
  isValidBaselineQuote,
  type NhlBaselineQuote,
  selectNewHighsLows,
} from "./new-highs-lows.ts";
import type { PolygonTicker } from "./selection.ts";

function quote(
  overrides: Partial<NhlBaselineQuote> & { symbol: string },
): NhlBaselineQuote {
  return {
    high_52w: 20,
    low_52w: 5,
    sessions_observed: 200,
    ...overrides,
  };
}

function ticker(partial: {
  ticker: string;
  volume?: number;
  price?: number;
  high?: number;
  low?: number;
}): PolygonTicker {
  const price = partial.price ?? 10;
  return {
    ticker: partial.ticker,
    updated: 1_752_000_000_000_000_000,
    day: {
      c: price,
      o: price,
      v: partial.volume ?? 1_000_000,
      h: partial.high ?? price,
      l: partial.low ?? price,
    },
    prevDay: { c: price * 0.9, v: 100_000 },
  };
}

function mapOf(...rows: NhlBaselineQuote[]): Map<string, NhlBaselineQuote> {
  return new Map(rows.map((r) => [r.symbol, r]));
}

Deno.test("exact high equality qualifies as new_high", () => {
  const baseline = quote({ symbol: "AAA", high_52w: 20, low_52w: 5 });
  assertEquals(
    classifyNewHighLow(ticker({ ticker: "AAA", high: 20, low: 8 }), baseline),
    "new_high",
  );
});

Deno.test("exact low equality qualifies as new_low", () => {
  const baseline = quote({ symbol: "BBB", high_52w: 20, low_52w: 5 });
  assertEquals(
    classifyNewHighLow(ticker({ ticker: "BBB", high: 12, low: 5 }), baseline),
    "new_low",
  );
});

Deno.test("both boundaries in one session classify as both", () => {
  const baseline = quote({ symbol: "CCC", high_52w: 20, low_52w: 5 });
  assertEquals(
    classifyNewHighLow(ticker({ ticker: "CCC", high: 20, low: 5 }), baseline),
    "both",
  );
});

Deno.test("missing baseline does not qualify", () => {
  assertEquals(
    classifyNewHighLow(ticker({ ticker: "DDD", high: 30, low: 1 }), null),
    null,
  );
  assertEquals(
    classifyNewHighLow(ticker({ ticker: "DDD", high: 30, low: 1 }), undefined),
    null,
  );
});

Deno.test("partial or invalid baseline does not qualify", () => {
  assertEquals(
    isValidBaselineQuote({
      symbol: "EEE",
      high_52w: 20,
      low_52w: 5,
      sessions_observed: 0,
    }),
    false,
  );
  assertEquals(
    isValidBaselineQuote({
      symbol: "EEE",
      high_52w: 4,
      low_52w: 9,
      sessions_observed: 10,
    }),
    false,
  );
  assertEquals(
    classifyNewHighLow(
      ticker({ ticker: "EEE", high: 30, low: 1 }),
      quote({ symbol: "EEE", high_52w: Number.NaN, low_52w: 5 }),
    ),
    null,
  );
  assertEquals(
    classifyNewHighLow(
      ticker({ ticker: "EEE", high: 30, low: 1 }),
      quote({ symbol: "OTHER", high_52w: 20, low_52w: 5 }),
    ),
    null,
  );
});

Deno.test("zero volume does not qualify", () => {
  const baseline = quote({ symbol: "FFF", high_52w: 20, low_52w: 5 });
  assertEquals(
    classifyNewHighLow(
      ticker({ ticker: "FFF", volume: 0, high: 25, low: 10 }),
      baseline,
    ),
    null,
  );
});

Deno.test("duplicate symbols keep a single volume-first row", () => {
  const baseline = quote({ symbol: "DUP", high_52w: 10, low_52w: 1 });
  const selected = selectNewHighsLows(
    [
      ticker({ ticker: "DUP", volume: 1_000, high: 12, low: 4 }),
      ticker({ ticker: "DUP", volume: 9_000, high: 12, low: 4 }),
    ],
    mapOf(baseline),
  );
  assertEquals(selected.map((r) => r.ticker.ticker), ["DUP"]);
  assertEquals(selected[0].range_event, "new_high");
});

Deno.test("volume-first ordering with symbol tie-break", () => {
  const baselines = mapOf(
    quote({ symbol: "ZZZ", high_52w: 10, low_52w: 1 }),
    quote({ symbol: "AAA", high_52w: 10, low_52w: 1 }),
    quote({ symbol: "MMM", high_52w: 10, low_52w: 1 }),
  );
  const selected = selectNewHighsLows(
    [
      ticker({ ticker: "ZZZ", volume: 5_000, high: 12, low: 4 }),
      ticker({ ticker: "MMM", volume: 9_000, high: 12, low: 4 }),
      ticker({ ticker: "AAA", volume: 9_000, high: 12, low: 4 }),
    ],
    baselines,
  );
  assertEquals(selected.map((r) => r.ticker.ticker), ["AAA", "MMM", "ZZZ"]);
});

Deno.test("event type does not override volume ranking", () => {
  const baselines = mapOf(
    quote({ symbol: "LOWEVT", high_52w: 10, low_52w: 1 }),
    quote({ symbol: "HIGHEVT", high_52w: 10, low_52w: 1 }),
  );
  const selected = selectNewHighsLows(
    [
      ticker({ ticker: "LOWEVT", volume: 2_000, high: 1, low: 1 }),
      ticker({ ticker: "HIGHEVT", volume: 8_000, high: 12, low: 4 }),
    ],
    baselines,
  );
  assertEquals(selected.map((r) => r.ticker.ticker), ["HIGHEVT", "LOWEVT"]);
  assertEquals(selected[0].range_event, "new_high");
  assertEquals(selected[1].range_event, "new_low");
});

Deno.test("combined board is capped at 20 rows", () => {
  const baselines = new Map<string, NhlBaselineQuote>();
  const universe: PolygonTicker[] = [];
  for (let i = 0; i < 25; i++) {
    const symbol = `S${String(i).padStart(2, "0")}`;
    baselines.set(symbol, quote({ symbol, high_52w: 10, low_52w: 1 }));
    universe.push(
      ticker({ ticker: symbol, volume: 1_000 + i, high: 12, low: 4 }),
    );
  }
  const selected = selectNewHighsLows(universe, baselines, 20);
  assertEquals(selected.length, 20);
  assertEquals(selected[0].ticker.ticker, "S24");
  assertEquals(selected[19].ticker.ticker, "S05");
});

Deno.test("empty baseline map yields no inferred securities", () => {
  assertEquals(
    selectNewHighsLows(
      [ticker({ ticker: "AAA", high: 99, low: 1 })],
      new Map(),
    ),
    [],
  );
});
