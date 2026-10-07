import { describe, expect, it } from "vitest";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import { radarRankedRowToStocksistSignal } from "@/lib/execution/signal/map-radar-row-to-stocksist-signal";
import { stocksistSignalsFromRadarRows } from "@/lib/execution/signal/ingest-radar-signals";
import { stocksistSignalToTradeIntent } from "@/lib/execution/signal/stocksist-signal-adapter";
import { PaperTraderSession } from "@/lib/execution/runtime/paper-trader-session";
import {
  clearPaperTraderState,
  loadPaperTraderState,
  savePaperTraderState,
} from "@/lib/execution/runtime/paper-trader-persistence";

function baseRow(overrides: Partial<RadarRankedRow> = {}): RadarRankedRow {
  return {
    symbol: "ABCD",
    price: 10,
    change_percent: 12.5,
    volume: 2_000_000,
    rvol_5m: 3.1,
    primary_scanner_event: "MOMENTUM_SPIKE",
    signal: "BUILDING",
    updated_at: "2026-10-06T18:00:00Z",
    rank: 1,
    ...overrides,
  } as RadarRankedRow;
}

describe("real radar → StocksistSignal", () => {
  it("maps screener row fields and builds trade intent", () => {
    const signal = radarRankedRowToStocksistSignal(baseRow(), "radar");
    expect(signal?.symbol).toBe("ABCD");
    expect(signal?.triggerPrice).toBe(10);
    const intent = stocksistSignalToTradeIntent(signal!);
    expect(intent.symbol).toBe("ABCD");
    expect(intent.strategyId).toBe("DAY_TRADE_RADAR_V1");
  });

  it("classifies catalyst and continuation sources", () => {
    const catalyst = stocksistSignalsFromRadarRows([
      baseRow({ promotion_reason: "catalyst verified", primary_scanner_event: "NEWS" }),
    ]);
    expect(catalyst[0]?.strategyId).toBe("CATALYST_MOMENTUM_V1");

    const continuation = radarRankedRowToStocksistSignal(baseRow(), "continuation");
    expect(continuation?.strategyId).toBe("STOCKSIST_CONTINUATION_V1");

    const classified = stocksistSignalsFromRadarRows([
      {
        ...baseRow({
          symbol: "CONT",
          provider_as_of: "2026-09-21T19:30:00.000Z",
          updated_at: "2026-09-21T19:30:00.000Z",
          freshness_class: "fresh",
          volume: 6_000_000,
        }),
        radar_trading_date: "2026-09-21",
        late_session_volume_velocity: "STRONG",
        close_distance_from_hod_pct: 0.4,
        rvol_20d: 12,
      } as RadarRankedRow,
    ]);
    expect(classified[0]?.strategyId).toBe("STOCKSIST_CONTINUATION_V1");
  });
});

describe("observe vs paper session paths", () => {
  it("observe records shadow without fill when execution disabled", async () => {
    const session = new PaperTraderSession({ mode: "observe", executionEnabled: false });
    const signal = radarRankedRowToStocksistSignal(baseRow(), "radar")!;
    await session.processSignal(signal);
    expect(session.getAccount().openPositions).toHaveLength(0);
    expect(session.getShadowRecords()[0]?.status).toBe("OBSERVING");
  });

  it("paper mode may enter when execution enabled", async () => {
    const session = new PaperTraderSession({ mode: "paper", executionEnabled: true, startingCash: 100_000 });
    const signal = radarRankedRowToStocksistSignal(baseRow({ symbol: "WXYZ" }), "radar")!;
    await session.processSignal(signal);
    expect(session.getShadowRecords()[0]?.status).toBe("PAPER_ENTERED");
    expect(session.getAccount().openPositions.length).toBeGreaterThan(0);
  });

  it("rejects duplicate signal id", async () => {
    const session = new PaperTraderSession();
    const signal = radarRankedRowToStocksistSignal(baseRow(), "radar")!;
    await session.processSignal(signal);
    const dup = await session.processSignal(signal);
    expect(dup).toBeNull();
  });
});

describe("paper trader persistence", () => {
  it("round-trips local session state", async () => {
    const session = new PaperTraderSession({ mode: "observe", executionEnabled: false });
    const signal = radarRankedRowToStocksistSignal(baseRow({ symbol: "PERS" }), "radar")!;
    await session.processSignal(signal);
    savePaperTraderState(session.exportPersistedState());
    const loaded = loadPaperTraderState();
    expect(loaded?.shadowRecords.length).toBe(1);
    expect(loaded?.processedSignalIds).toContain(signal.id);

    const restored = new PaperTraderSession({ persisted: loaded });
    expect(restored.getShadowRecords()).toHaveLength(1);
    expect(restored.hasSeenSignal(signal.id)).toBe(true);
    clearPaperTraderState();
    expect(loadPaperTraderState()).toBeNull();
  });
});
