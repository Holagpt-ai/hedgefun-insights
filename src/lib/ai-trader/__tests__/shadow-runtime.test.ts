import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_TRADER_CURRENT_OPERATING_MODE, AI_TRADER_OFF_COPY } from "@/lib/ai-trader/operating-mode";
import { AI_TRADER_SHELL_SNAPSHOT } from "@/lib/ai-trader/public-snapshot";
import {
  MARKET_INTELLIGENCE_CAPABILITIES,
  type MarketCandidate,
} from "@/lib/ai-trader/market/candidate";
import type { MarketIntelligenceAdapter } from "@/lib/ai-trader/market/intelligence-adapter";
import { createAiTraderShadowRuntime } from "@/lib/ai-trader/runtime/shadow-runtime";
import { createMemoryShadowPersistence } from "@/lib/ai-trader/runtime/memory-shadow-persistence";
import { evaluateShadowReadiness } from "@/lib/ai-trader/runtime/readiness";
import { buildCandidateContextSnapshot } from "@/lib/ai-trader/runtime/context-builder";
import { hashContextSnapshot } from "@/lib/ai-trader/domain/context";
import { createDeferredHistoricalOutcomeObserver } from "@/lib/ai-trader/runtime/outcome-follow-up";
import { runShadowWorkerEntrypoint } from "@/lib/ai-trader/runtime/shadow-worker-entrypoint";
import { SHADOW_WORKER_ENV_KEYS, shadowWorkerUsesBrowserEnv } from "@/lib/ai-trader/runtime/env-contract";
import { AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES } from "@/lib/ai-trader/domain/watchlist";
import { proposeShadowWatchlistChanges } from "@/lib/ai-trader/runtime/watchlist-policy";
import { buildRealObservations } from "@/lib/ai-trader/runtime/observation-builder";

const NOW = "2026-09-28T13:35:00.000Z";
const NOW_MS = Date.parse(NOW);

function candidate(partial: Partial<MarketCandidate> & Pick<MarketCandidate, "symbol" | "sourceRank">): MarketCandidate {
  return {
    securityId: null,
    assetClass: "US_EQUITY",
    source: "radar_v22_board",
    sourceSession: "2026-09-28:market",
    surveillanceDate: "2026-09-28",
    lifecycle: "ACTIVE",
    lastPrice: 2.4,
    volume: 1_500_000,
    shortWindowVolume: 40_000,
    dollarVolume: 90_000,
    sessionHigh: 2.6,
    sessionLow: 2.2,
    sessionVwap: null,
    rvol5m: null,
    scannerEvents: null,
    catalystRefs: [],
    historicalRefs: [],
    quality: {
      feedStatus: "available",
      missingFields: ["bid", "ask", "spread"],
      capabilities: MARKET_INTELLIGENCE_CAPABILITIES,
    },
    provenance: {
      generationId: "gen-1",
      providerAsOf: "2026-09-28T13:34:00.000Z",
      radarUpdatedAt: "2026-09-28T13:34:00.000Z",
      table: "radar_v22_board",
    },
    ...partial,
  };
}

function adapter(board: readonly MarketCandidate[]): MarketIntelligenceAdapter {
  return {
    async getCandidateBoard() {
      return board;
    },
    async getSymbolContext() {
      return null;
    },
  };
}

function runtime(options: {
  mode: "OFF" | "SHADOW";
  board?: readonly MarketCandidate[];
  persistence?: ReturnType<typeof createMemoryShadowPersistence>;
  session?: "REGULAR" | "CLOSED" | "HOLIDAY";
  failAdapter?: boolean;
}) {
  const persistence = options.persistence ?? createMemoryShadowPersistence();
  const market = options.failAdapter
    ? {
        async getCandidateBoard(): Promise<never> {
          throw new Error("radar unavailable");
        },
        async getSymbolContext(): Promise<never> {
          throw new Error("radar unavailable");
        },
      }
    : adapter(options.board ?? [candidate({ symbol: "AMC", sourceRank: 1 })]);
  return {
    persistence,
    shadow: createAiTraderShadowRuntime({
      readOperatingMode: async () => options.mode,
      marketAdapter: market,
      persistence,
      now: () => new Date(NOW),
      resolveSession: () => options.session ?? "REGULAR",
    }),
  };
}

describe("AI Trader shadow observation runtime", () => {
  it("skips the entire cycle in OFF and writes nothing", async () => {
    const { shadow, persistence } = runtime({ mode: "OFF" });
    const result = await shadow.runCycle();
    expect(result.status).toBe("SKIPPED");
    expect(result.reason).toBe("OPERATING_MODE_OFF");
    expect(result.discoveredCount).toBe(0);
    expect(result.contextSnapshotsWritten).toBe(0);
    expect(result.observationsWritten).toBe(0);
    expect(persistence.counts.watchlistWrites).toBe(0);
    expect(persistence.counts.transitionWrites).toBe(0);
    expect(persistence.counts.sessionWrites).toBe(0);
    expect(persistence.items).toHaveLength(0);
  });

  it("keeps SHADOW observational and preserves Radar rank without rerank", async () => {
    const board = [
      candidate({ symbol: "AMC", sourceRank: 1 }),
      candidate({ symbol: "GME", sourceRank: 2 }),
    ];
    const { shadow, persistence } = runtime({ mode: "SHADOW", board });
    const result = await shadow.runCycle();
    expect(result.status).toBe("COMPLETED");
    expect(result).not.toHaveProperty("pnl");
    expect(result).not.toHaveProperty("orderCount");
    expect(result.observedCandidateCount).toBe(2);
    expect(result.eligibleCandidateCount).toBe(2);
    expect(result.discoveredCount).toBe(2);
    expect(persistence.items.map((item) => item.symbol)).toEqual(["AMC", "GME"]);
    expect(persistence.items.map((item) => item.sourceRank)).toEqual([1, 2]);
    expect(persistence.items.every((item) => item.state === "DISCOVERED")).toBe(true);
  });

  it("rejects stale, future, and prior-session candidates", async () => {
    const board = [
      candidate({
        symbol: "OLD",
        sourceRank: 1,
        quality: {
          feedStatus: "stale",
          missingFields: [],
          capabilities: MARKET_INTELLIGENCE_CAPABILITIES,
        },
      }),
      candidate({
        symbol: "FUT",
        sourceRank: 2,
        provenance: {
          generationId: "gen-1",
          providerAsOf: "2026-09-28T18:00:00.000Z",
          radarUpdatedAt: "2026-09-28T18:00:00.000Z",
          table: "radar_v22_board",
        },
      }),
      candidate({
        symbol: "YDAY",
        sourceRank: 3,
        surveillanceDate: "2026-09-27",
      }),
    ];
    const { shadow, persistence } = runtime({ mode: "SHADOW", board });
    const result = await shadow.runCycle();
    expect(result.eligibleCandidateCount).toBe(0);
    expect(result.errors.map((error) => error.code).sort()).toEqual([
      "FUTURE_EVIDENCE",
      "PRIOR_SESSION_NOT_CURRENT",
      "STALE_SOURCE_DATA",
    ]);
    expect(persistence.counts.watchlistWrites).toBe(0);
  });

  it("keeps missing optional values missing and does not infer halts", () => {
    const row = candidate({ symbol: "AMC", sourceRank: 1, sessionVwap: null, rvol5m: null });
    const observations = buildRealObservations(row, "REGULAR");
    expect(observations.every((item) => !("bid" in item.value) && !("ask" in item.value))).toBe(true);
    expect(row.sessionVwap).toBeNull();
    expect(row.quality.capabilities.verifiedHaltFeed).toBe(false);
    expect(row.quality.missingFields).toContain("bid");
  });

  it("creates DISCOVERED, advances legally, and writes no transition when unchanged", async () => {
    const persistence = createMemoryShadowPersistence();
    const first = runtime({ mode: "SHADOW", persistence });
    await first.shadow.runCycle();
    expect(persistence.items[0]?.state).toBe("DISCOVERED");
    const second = runtime({ mode: "SHADOW", persistence });
    await second.shadow.runCycle();
    expect(persistence.items[0]?.state).toBe("RESEARCHING");
    const before = persistence.counts.transitionWrites;
    const third = runtime({ mode: "SHADOW", persistence, board: [] , session: "CLOSED" });
    await third.shadow.runCycle();
    expect(persistence.items[0]?.state).toBe("REMOVED");
    const again = runtime({
      mode: "SHADOW",
      persistence,
      board: [],
      session: "CLOSED",
    });
    await again.shadow.runCycle();
    expect(persistence.counts.transitionWrites).toBe(before + 1);
  });

  it("never produces ENTRY_READY, POSITION_OPEN, or EXITED", () => {
    const proposals = proposeShadowWatchlistChanges(
      [candidate({ symbol: "AMC", sourceRank: 1 })],
      [],
    );
    expect(proposals.every((row) => !AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES.includes(row.nextState as never))).toBe(
      true,
    );
  });

  it("dedupes context and observations and transitions", async () => {
    const persistence = createMemoryShadowPersistence();
    const first = runtime({ mode: "SHADOW", persistence });
    const a = await first.shadow.runCycle();
    const b = await first.shadow.runCycle();
    expect(a.contextSnapshotsWritten).toBe(1);
    expect(b.contextSnapshotsWritten).toBe(0);
    expect(b.observationsWritten).toBe(0);
    const snapshot = buildCandidateContextSnapshot(candidate({ symbol: "AMC", sourceRank: 1 }), {
      operatingMode: "SHADOW",
      marketSession: "REGULAR",
      cycleNowMs: NOW_MS,
    });
    if (!snapshot) throw new Error("expected snapshot");
    const { contextHash, ...payload } = snapshot;
    expect(hashContextSnapshot(payload)).toBe(contextHash);
  });

  it("does not put forward outcomes into present context", async () => {
    const snapshot = buildCandidateContextSnapshot(candidate({ symbol: "AMC", sourceRank: 1 }), {
      operatingMode: "SHADOW",
      marketSession: "REGULAR",
      cycleNowMs: NOW_MS,
    });
    expect(snapshot?.historicalRefs).toEqual([]);
    const observer = createDeferredHistoricalOutcomeObserver();
    expect(
      await observer.observeAfterHorizon({
        symbol: "AMC",
        discoveredAt: NOW,
        evaluationHorizonEnd: "2026-09-28T20:00:00.000Z",
        cycleNow: NOW,
      }),
    ).toBeNull();
  });

  it("produces no fabricated candidates when the market is closed", async () => {
    const { shadow, persistence } = runtime({
      mode: "SHADOW",
      session: "CLOSED",
      board: [candidate({ symbol: "AMC", sourceRank: 1 })],
    });
    const result = await shadow.runCycle();
    expect(result.observedCandidateCount).toBe(0);
    expect(result.discoveredCount).toBe(0);
    expect(persistence.items).toHaveLength(0);
  });

  it("isolates one malformed candidate and fails the cycle on systemic adapter errors", async () => {
    const board = [
      candidate({ symbol: "bad!", sourceRank: 1 }),
      candidate({ symbol: "AMC", sourceRank: 2 }),
    ];
    const ok = runtime({ mode: "SHADOW", board });
    const isolated = await ok.shadow.runCycle();
    expect(isolated.status).toBe("COMPLETED");
    expect(isolated.eligibleCandidateCount).toBe(1);
    const failed = runtime({ mode: "SHADOW", failAdapter: true });
    const systemic = await failed.shadow.runCycle();
    expect(systemic.status).toBe("FAILED");
    expect(systemic.reason).toBe("MARKET_ADAPTER_UNAVAILABLE");
  });

  it("has no model, broker, user-watchlist, or import-time activation", async () => {
    const runtimeSrc = readFileSync(join(process.cwd(), "src/lib/ai-trader/runtime/shadow-runtime.ts"), "utf8");
    expect(runtimeSrc).not.toMatch(/anthropic|openai|alpaca|broker/i);
    expect(runtimeSrc).not.toContain("from(\"watchlists\")");
    expect(shadowWorkerUsesBrowserEnv(SHADOW_WORKER_ENV_KEYS.supabaseServiceRoleKey)).toBe(false);
    expect(evaluateShadowReadiness({
      runtimeSchemaPresent: true,
      watchlistSchemaPresent: true,
      marketAdapter: adapter([]),
      sessionPolicyAvailable: true,
      persistence: createMemoryShadowPersistence(),
      operatingModeReadable: true,
      transitionRpcPresent: true,
    }).status).toBe("READY");
    expect(evaluateShadowReadiness({
      runtimeSchemaPresent: false,
      watchlistSchemaPresent: true,
      marketAdapter: adapter([]),
      sessionPolicyAvailable: true,
      persistence: createMemoryShadowPersistence(),
      operatingModeReadable: true,
      transitionRpcPresent: true,
    }).status).toBe("NOT_READY");
    expect(AI_TRADER_CURRENT_OPERATING_MODE).toBe("OFF");
    expect(AI_TRADER_SHELL_SNAPSHOT.statusCopy).toBe(AI_TRADER_OFF_COPY);
    expect(AI_TRADER_SHELL_SNAPSHOT.watchlist).toEqual([]);
    for (const file of [
      "src/pages/dashboard/AiTraderPage.tsx",
      "src/features/ai-trader/AiTraderWorkspace.tsx",
      "src/components/home/AiTraderLivePreview.tsx",
    ]) {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(src).not.toContain("ai-trader/runtime");
    }
    const persistence = createMemoryShadowPersistence();
    await runShadowWorkerEntrypoint(
      {
        readOperatingMode: async () => "OFF",
        marketAdapter: adapter([candidate({ symbol: "AMC", sourceRank: 1 })]),
        persistence,
        now: () => new Date(NOW),
        resolveSession: () => "REGULAR",
      },
      { allowExecute: true },
    );
    expect(persistence.counts.watchlistWrites).toBe(0);
  });
});
