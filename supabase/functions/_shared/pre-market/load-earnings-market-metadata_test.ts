import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  isFreshScreenerActivityRow,
  mergeEarningsMarketMetadata,
  type ScreenerActivityRow,
} from "./load-earnings-market-metadata.ts";
import { scoreEarningsMarketImpact } from "./earnings-market-impact.ts";

const NOW = Date.parse("2026-10-27T13:00:00.000Z");

Deno.test("Batch 187.1 — stale screener row does not verify activity", () => {
  const staleUpdated = "2026-10-27T11:00:00.000Z";
  assertEquals(
    isFreshScreenerActivityRow(staleUpdated, { nowMs: NOW, sessionActive: true }),
    false,
  );
  const freshUpdated = "2026-10-27T12:45:00.000Z";
  assertEquals(
    isFreshScreenerActivityRow(freshUpdated, { nowMs: NOW, sessionActive: true }),
    true,
  );
});

Deno.test("Batch 187.1 — activity from non-radar tab counts when fresh", () => {
  const rows: ScreenerActivityRow[] = [{
    symbol: "SOFI",
    tab_id: "volume_spikes",
    volume: 8_000_000,
    rvol_20d: 3.1,
    change_percent: 5.2,
    price: 9,
    updated_at: "2026-10-27T12:50:00.000Z",
  }];
  const meta = mergeEarningsMarketMetadata(
    ["SOFI"],
    rows,
    [{ symbol: "SOFI", market_cap: 8_000_000_000 }],
    { nowMs: NOW, sessionActive: true },
  );
  const sofi = meta.get("SOFI")!;
  assertEquals(sofi.activity_verified, true);
  assertEquals(sofi.activity_tab_id, "volume_spikes");
});

Deno.test("Batch 187.1 — top radar slice miss does not block symbol-specific screener hit", () => {
  const rows: ScreenerActivityRow[] = [{
    symbol: "TINY",
    tab_id: "gappers",
    volume: 2_000_000,
    rvol_20d: null,
    change_percent: 18,
    price: 4,
    updated_at: "2026-10-27T12:55:00.000Z",
  }];
  const meta = mergeEarningsMarketMetadata(
    ["TINY"],
    rows,
    [],
    { nowMs: NOW, sessionActive: true },
  );
  assertEquals(meta.get("TINY")?.activity_verified, true);
});

Deno.test("Batch 187.1 — outside active session yields no verified activity", () => {
  const rows: ScreenerActivityRow[] = [{
    symbol: "ABC",
    tab_id: "day_trade_radar",
    volume: 5_000_000,
    rvol_20d: 2,
    change_percent: 1,
    price: 10,
    updated_at: "2026-10-27T12:55:00.000Z",
  }];
  const meta = mergeEarningsMarketMetadata(
    ["ABC"],
    rows,
    [],
    { nowMs: NOW, sessionActive: false },
  );
  assertEquals(meta.get("ABC")?.activity_verified, false);
});

Deno.test("Batch 187.1 — unverified activity metadata does not invent momentum score", () => {
  const score = scoreEarningsMarketImpact(
    {
      symbol: "XYZ",
      provider: "earnings_calendar",
      verification_state: "provider_reported",
      event_type: "earnings",
      event_date: "2026-10-27",
      facts: {},
    },
    {
      onWatchlist: false,
      metadata: {
        market_cap: null,
        volume: 50_000_000,
        rvol_20d: 9,
        change_percent: 20,
        price: 1,
        activity_verified: false,
        activity_as_of: null,
        activity_tab_id: null,
      },
    },
  );
  assertEquals(score.activity, 0);
});
