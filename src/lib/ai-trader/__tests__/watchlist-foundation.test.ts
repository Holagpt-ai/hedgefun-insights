import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES,
  AI_TRADER_WATCHLIST_SPRINT_3A_STATES,
  AI_TRADER_WATCHLIST_STATES,
  assertSprint3AEngineState,
  canTransitionWatchlistState,
} from "@/lib/ai-trader/domain/watchlist";
import { filterEligibleCandidates } from "@/lib/ai-trader/market/candidate-filter";
import { candidatesPreserveSourceRank, type MarketCandidate } from "@/lib/ai-trader/market/candidate";
import { proposeWatchlistTransitions } from "@/lib/ai-trader/market/watchlist-engine";
import { createStocksistMarketIntelligenceAdapter } from "@/lib/ai-trader/market/stocksist-intelligence-adapter";
import type { IntelligenceSnapshot } from "@/lib/ai-trader/market/intelligence-adapter";
import type { RadarV22BoardRow, RadarV22FeedState } from "@/lib/radar-v22";
import { AI_TRADER_CURRENT_OPERATING_MODE, AI_TRADER_OFF_COPY } from "@/lib/ai-trader/operating-mode";
import { AI_TRADER_SHELL_SNAPSHOT } from "@/lib/ai-trader/public-snapshot";
import {
  AI_TRADER_WATCHLIST_APPLY_MIGRATION,
  AI_TRADER_WATCHLIST_MIGRATION_FILENAME,
  AI_TRADER_LOVABLE_DRIZZLE_MEMORY_MIRROR,
} from "@/lib/ai-trader/schema/schema-spec";
import * as watchlistStore from "@/lib/ai-trader/persistence/watchlist-store";

const repoRoot = process.cwd();

function candidate(partial: Partial<MarketCandidate> & Pick<MarketCandidate, "symbol" | "sourceRank">): MarketCandidate {
  return {
    securityId: null,
    assetClass: "US_EQUITY",
    source: "radar_v22_board",
    sourceSession: "2026-09-27:pre-market",
    surveillanceDate: "2026-09-27",
    lifecycle: "ACTIVE",
    lastPrice: 2.5,
    volume: 1_000_000,
    shortWindowVolume: 50_000,
    dollarVolume: 80_000,
    sessionHigh: 2.8,
    sessionLow: 2.1,
    sessionVwap: null,
    rvol5m: null,
    scannerEvents: null,
    catalystRefs: [],
    historicalRefs: [],
    quality: {
      feedStatus: "available",
      missingFields: ["bid"],
      capabilities: {
        volumeFirstRank: true,
        bidAsk: false,
        spread: false,
        level2: false,
        timesAndSales: false,
        verifiedHaltFeed: false,
        vwapVerified: false,
        embeddings: false,
      },
    },
    provenance: {
      generationId: "gen-1",
      providerAsOf: "2026-09-27T13:30:00.000Z",
      radarUpdatedAt: "2026-09-27T13:30:00.000Z",
      table: "radar_v22_board",
    },
    ...partial,
  };
}

function boardRow(rank: number, symbol: string): RadarV22BoardRow {
  return {
    generation_id: "gen-1",
    rank,
    symbol,
    company_name: symbol,
    lifecycle: "ACTIVE",
    signal_status: "BUILDING",
    price: 3,
    change_percent: 10,
    volume: 2_000_000 - rank * 10_000,
    prior_session_volume: 500_000,
    volume_ratio_prior_session: 4,
    day_high: 3.2,
    day_low: 2.7,
    rolling_volume_5s: 1000,
    rolling_volume_15s: 3000,
    rolling_volume_60s: 9000,
    rolling_dollar_volume_60s: 27000,
    acceleration_5m: null,
    session_vwap: null,
    peak_volume_15s: 4000,
    provider_as_of: "2026-09-27T13:30:00.000Z",
    updated_at: "2026-09-27T13:30:00.000Z",
  };
}

describe("AI Trader watchlist + market intelligence", () => {
  it("defines the full watchlist graph and the Sprint 3A ceiling", () => {
    expect([...AI_TRADER_WATCHLIST_STATES]).toContain("ENTRY_READY");
    expect([...AI_TRADER_WATCHLIST_SPRINT_3A_STATES]).toEqual([
      "DISCOVERED",
      "RESEARCHING",
      "WATCHING",
      "HIGH_PRIORITY",
      "COOLDOWN",
      "REMOVED",
    ]);
    expect([...AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES]).toEqual([
      "ENTRY_READY",
      "POSITION_OPEN",
      "EXITED",
    ]);
    expect(canTransitionWatchlistState("DISCOVERED", "RESEARCHING")).toBe(true);
    expect(canTransitionWatchlistState("HIGH_PRIORITY", "REMOVED")).toBe(true);
    expect(canTransitionWatchlistState("EXITED", "WATCHING")).toBe(false);
    expect(() => assertSprint3AEngineState("ENTRY_READY")).toThrow(/cannot produce/);
  });

  it("filters without re-ranking Radar sourceRank", () => {
    const rows = [
      candidate({ symbol: "AMC", sourceRank: 1 }),
      candidate({ symbol: "GME", sourceRank: 2, volume: 0 }),
      candidate({ symbol: "BB", sourceRank: 3 }),
    ];
    const filtered = filterEligibleCandidates(rows);
    expect(filtered.map((row) => row.symbol)).toEqual(["AMC", "BB"]);
    expect(candidatesPreserveSourceRank(filtered)).toBe(true);
    expect(filtered[0].sourceRank).toBe(1);
  });

  it("proposes only Sprint 3A states and never trading states", () => {
    const first = proposeWatchlistTransitions([candidate({ symbol: "AMC", sourceRank: 1 })], []);
    expect(first).toHaveLength(1);
    expect(first[0].nextState).toBe("DISCOVERED");
    const second = proposeWatchlistTransitions(
      [candidate({ symbol: "AMC", sourceRank: 1 })],
      [
        {
          id: "wl-1",
          symbol: "AMC",
          securityId: null,
          assetClass: "US_EQUITY",
          state: "DISCOVERED",
          discoveredAt: "2026-09-27T12:00:00.000Z",
          lastEvaluatedAt: "2026-09-27T12:00:00.000Z",
          currentPriority: 1,
          source: "radar_v22_board",
          sourceRank: 1,
          sourceSession: null,
          contextSnapshotId: null,
          catalystRefs: [],
          marketEvidenceRefs: [],
          reasonCodes: [],
          confidence: null,
          expiresAt: null,
          cooldownUntil: null,
          createdAt: "2026-09-27T12:00:00.000Z",
          updatedAt: "2026-09-27T12:00:00.000Z",
        },
      ],
    );
    expect(second[0].nextState).toBe("RESEARCHING");
    expect(second.every((row) => !AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES.includes(row.nextState as never))).toBe(
      true,
    );
  });

  it("consumes Radar rank order and does not invent symbols", async () => {
    const state: RadarV22FeedState = {
      state_key: "current",
      generation_id: "gen-1",
      status: "available",
      session_date: "2026-09-27",
      synced_at: "2026-09-27T13:30:00.000Z",
      provider_as_of_min: "2026-09-27T13:29:00.000Z",
      provider_as_of_max: "2026-09-27T13:30:00.000Z",
      last_provider_event_at: "2026-09-27T13:30:00.000Z",
      symbol_count: 2,
      feed_stale: false,
      updated_at: "2026-09-27T13:30:00.000Z",
    };
    const snapshot: IntelligenceSnapshot = {
      radarState: state,
      radarBoard: [boardRow(2, "GME"), boardRow(1, "AMC")],
    };
    const adapter = createStocksistMarketIntelligenceAdapter(() => snapshot);
    const board = await adapter.getCandidateBoard({
      asOfMs: Date.parse("2026-09-27T13:30:00.000Z"),
      todayEt: "2026-09-27",
    });
    expect(board.map((row) => row.symbol)).toEqual(["AMC", "GME"]);
    expect(board.map((row) => row.sourceRank)).toEqual([1, 2]);
    expect(board.every((row) => row.source === "radar_v22_board")).toBe(true);
    expect(board[0].quality.capabilities.bidAsk).toBe(false);
    expect(board[0].quality.capabilities.embeddings).toBe(false);
    expect(await adapter.getSymbolContext({
      symbol: "ZZZ",
      asOfMs: Date.parse("2026-09-27T13:30:00.000Z"),
      todayEt: "2026-09-27",
    })).toBeNull();
  });

  it("authors an unapplied watchlist migration without user-watchlist reuse", () => {
    expect(AI_TRADER_WATCHLIST_APPLY_MIGRATION).toBe(false);
    expect(AI_TRADER_WATCHLIST_MIGRATION_FILENAME).toBe(
      "20260927230000_ai_trader_watchlist_foundation_v1.sql",
    );
    const sql = readFileSync(join(repoRoot, "supabase/migrations", AI_TRADER_WATCHLIST_MIGRATION_FILENAME), "utf8");
    expect(sql).toContain("CREATE TABLE public.ai_trader_watchlist_items");
    expect(sql).toContain("CREATE TABLE public.ai_trader_watchlist_transitions");
    expect(sql).not.toContain("CREATE TABLE public.watchlists");
    expect(sql).not.toContain("CREATE TABLE public.ai_trader_orders");
    expect(sql).not.toMatch(/CREATE EXTENSION|vector\(/i);
    expect(sql).not.toContain("ENTRY_READY'); -- produced");
    expect(Object.keys(watchlistStore)).toEqual(["listWatchlistItems", "persistWatchlistProposal"]);
    expect(watchlistStore).not.toHaveProperty("setState");
    expect(watchlistStore).not.toHaveProperty("openPosition");
  });

  it("keeps Lovable generated artifacts and the OFF shell unchanged", () => {
    const drizzle = readFileSync(join(repoRoot, AI_TRADER_LOVABLE_DRIZZLE_MEMORY_MIRROR), "utf8");
    expect(drizzle).toContain("CREATE TABLE public.ai_trader_runtime");
    const types = readFileSync(join(repoRoot, "src/integrations/supabase/types.ts"), "utf8");
    expect(types).toContain("ai_trader_runtime");
    expect(types).not.toContain("ai_trader_watchlist_items");
    expect(AI_TRADER_CURRENT_OPERATING_MODE).toBe("OFF");
    expect(AI_TRADER_SHELL_SNAPSHOT.statusCopy).toBe(AI_TRADER_OFF_COPY);
    expect(AI_TRADER_SHELL_SNAPSHOT.watchlist).toEqual([]);
    const shellFiles = [
      "src/pages/dashboard/AiTraderPage.tsx",
      "src/features/ai-trader/AiTraderWorkspace.tsx",
      "src/components/home/AiTraderLivePreview.tsx",
    ];
    for (const file of shellFiles) {
      const src = readFileSync(join(repoRoot, file), "utf8");
      expect(src).not.toContain("ai-trader/market");
      expect(src).not.toContain("ai-trader/persistence/watchlist");
    }
  });
});
