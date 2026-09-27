import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_TRADER_CURRENT_OPERATING_MODE, AI_TRADER_OFF_COPY } from "@/lib/ai-trader/operating-mode";
import { AI_TRADER_SHELL_SNAPSHOT } from "@/lib/ai-trader/public-snapshot";
import {
  AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES,
  AI_TRADER_WATCHLIST_TRANSITIONS,
} from "@/lib/ai-trader/domain/watchlist";
import {
  buildWatchlistTransitionIdempotencyKey,
  simulateWatchlistTransitionRpc,
  WATCHLIST_TRANSITION_RPC_NAME,
  type InMemoryWatchlistTransitionStore,
} from "@/lib/ai-trader/domain/watchlist-transition-rpc";
import {
  AI_TRADER_WATCHLIST_TRANSITION_RPC_APPLY_MIGRATION,
  AI_TRADER_WATCHLIST_TRANSITION_RPC_MIGRATION_FILENAME,
} from "@/lib/ai-trader/schema/schema-spec";
import { SHADOW_OBSERVATION_POLICY, isHighPriorityObservation } from "@/lib/ai-trader/runtime/observation-policy";
import { evaluateShadowReadiness } from "@/lib/ai-trader/runtime/readiness";
import { createMemoryShadowPersistence } from "@/lib/ai-trader/runtime/memory-shadow-persistence";
import { shadowWorkerExecuteAllowed, runShadowWorkerBootstrap } from "@/lib/ai-trader/runtime/shadow-worker-bootstrap";
import { createSqlShadowPersistence } from "@/lib/ai-trader/persistence/shadow-store";
import { persistWatchlistProposal } from "@/lib/ai-trader/persistence/watchlist-store";

const repoRoot = process.cwd();
const rpcSql = readFileSync(
  join(repoRoot, "supabase/migrations", AI_TRADER_WATCHLIST_TRANSITION_RPC_MIGRATION_FILENAME),
  "utf8",
);

function rpcInput(partial: Partial<Parameters<typeof simulateWatchlistTransitionRpc>[1]> = {}) {
  return {
    symbol: "AMC",
    newState: "DISCOVERED" as const,
    expectedPriorState: null,
    idempotencyKey: "wl-tx:AMC:NULL:DISCOVERED:cycle-1:shadow-observation-v1:NO_CONTEXT:radar:1",
    occurredAt: "2026-09-28T13:35:00.000Z",
    sourceRank: 1,
    source: "radar_v22_board",
    sourceSession: "2026-09-28:market",
    reasonCodes: ["DISCOVERED_FROM_RADAR"],
    evidenceIds: [],
    contextSnapshotId: null,
    actorType: "SYSTEM",
    catalystRefs: [],
    marketEvidenceRefs: [],
    cooldownUntil: null,
    ...partial,
  };
}

describe("AI Trader watchlist transition RPC + shadow hardening", () => {
  it("authors an unapplied atomic RPC migration with durable idempotency", () => {
    expect(AI_TRADER_WATCHLIST_TRANSITION_RPC_APPLY_MIGRATION).toBe(false);
    expect(rpcSql).toContain(`CREATE OR REPLACE FUNCTION public.${WATCHLIST_TRANSITION_RPC_NAME}(p_row jsonb)`);
    expect(rpcSql).toContain("RETURNS jsonb");
    expect(rpcSql).toContain("FOR UPDATE");
    expect(rpcSql).toContain("idempotency_key");
    expect(rpcSql).toContain("ai_trader_watchlist_transitions_idempotency_uidx");
    expect(rpcSql).toContain("prior_state");
    expect(rpcSql).toContain("INSERT INTO public.ai_trader_watchlist_items");
    expect(rpcSql).toContain("INSERT INTO public.ai_trader_watchlist_transitions");
    expect(rpcSql).toContain("UPDATE public.ai_trader_watchlist_items");
    expect(rpcSql).not.toMatch(/SECURITY DEFINER/);
    expect(rpcSql).toContain("SET search_path TO public");
    expect(rpcSql).toContain(
      `GRANT EXECUTE ON FUNCTION public.${WATCHLIST_TRANSITION_RPC_NAME}(jsonb) TO service_role`,
    );
    expect(rpcSql).toContain(
      `REVOKE ALL ON FUNCTION public.${WATCHLIST_TRANSITION_RPC_NAME}(jsonb) FROM PUBLIC, anon, authenticated`,
    );
    expect(rpcSql).not.toMatch(/CREATE EXTENSION|vector\(/i);
    expect(rpcSql).not.toContain("CREATE TABLE public.ai_trader_orders");
    expect(rpcSql).not.toContain("CREATE TABLE public.ai_trader_positions");
    expect(rpcSql).not.toMatch(/UPDATE public\.ai_trader_runtime/);
    expect(rpcSql).not.toContain("SET operating_mode");
  });

  it("rejects SHADOW-era trading states in SQL and in the in-memory RPC", () => {
    for (const state of AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES) {
      expect(rpcSql).toContain(`'${state}'`);
    }
    expect(rpcSql).toContain("SHADOW-era RPC cannot enter ENTRY_READY, POSITION_OPEN, or EXITED");
    expect(rpcSql).toContain("'HIGH_PRIORITY', 'COOLDOWN', 'REMOVED'");
    expect(rpcSql).not.toContain("('HIGH_PRIORITY', 'ENTRY_READY')");
    const store: InMemoryWatchlistTransitionStore = { items: [], transitions: [] };
    for (const newState of AI_TRADER_WATCHLIST_FORBIDDEN_ENGINE_STATES) {
      expect(
        simulateWatchlistTransitionRpc(store, rpcInput({ newState, idempotencyKey: `bad-${newState}` })).status,
      ).toBe("PROHIBITED_STATE");
    }
    expect(store.items).toHaveLength(0);
    expect(store.transitions).toHaveLength(0);
  });

  it("atomically creates DISCOVERED with null prior_state and rejects non-DISCOVERED first rows", () => {
    const store: InMemoryWatchlistTransitionStore = { items: [], transitions: [] };
    const applied = simulateWatchlistTransitionRpc(store, rpcInput());
    expect(applied.status).toBe("APPLIED");
    expect(applied.priorState).toBeNull();
    expect(applied.newState).toBe("DISCOVERED");
    expect(store.items[0]?.state).toBe("DISCOVERED");
    expect(store.transitions).toHaveLength(1);
    const invalid = simulateWatchlistTransitionRpc(
      { items: [], transitions: [] },
      rpcInput({ newState: "WATCHING", idempotencyKey: "other" }),
    );
    expect(invalid.status).toBe("INVALID_TRANSITION");
  });

  it("is idempotent without using occurredAt and conflicts on stale expected state", () => {
    const store: InMemoryWatchlistTransitionStore = { items: [], transitions: [] };
    const first = simulateWatchlistTransitionRpc(store, rpcInput({ occurredAt: "2026-09-28T13:35:00.000Z" }));
    const retry = simulateWatchlistTransitionRpc(store, rpcInput({ occurredAt: "2026-09-28T13:35:00.250Z" }));
    expect(first.status).toBe("APPLIED");
    expect(retry.status).toBe("NO_CHANGE");
    expect(retry.transitionId).toBe(first.transitionId);
    expect(store.transitions).toHaveLength(1);
    expect(
      buildWatchlistTransitionIdempotencyKey({
        symbol: "AMC",
        priorState: null,
        newState: "DISCOVERED",
        cycleId: "cycle-1",
        policyVersion: "shadow-observation-v1",
      }),
    ).not.toMatch(/2026-09-28T/);
    const conflict = simulateWatchlistTransitionRpc(
      store,
      rpcInput({
        newState: "RESEARCHING",
        expectedPriorState: "WATCHING",
        idempotencyKey: "stale-key",
      }),
    );
    expect(conflict.status).toBe("CONFLICT");
    expect(store.items[0]?.state).toBe("DISCOVERED");
  });

  it("applies only legal SHADOW-era transitions and preserves the future graph", () => {
    expect(AI_TRADER_WATCHLIST_TRANSITIONS.HIGH_PRIORITY).toContain("ENTRY_READY");
    const store: InMemoryWatchlistTransitionStore = { items: [], transitions: [] };
    simulateWatchlistTransitionRpc(store, rpcInput());
    const researching = simulateWatchlistTransitionRpc(
      store,
      rpcInput({
        newState: "RESEARCHING",
        expectedPriorState: "DISCOVERED",
        idempotencyKey: "promo-1",
      }),
    );
    expect(researching.status).toBe("APPLIED");
    const invalid = simulateWatchlistTransitionRpc(
      store,
      rpcInput({
        newState: "HIGH_PRIORITY",
        expectedPriorState: "RESEARCHING",
        idempotencyKey: "illegal-jump",
      }),
    );
    expect(invalid.status).toBe("INVALID_TRANSITION");
    expect(store.items[0]?.state).toBe("RESEARCHING");
  });

  it("centralizes HIGH_PRIORITY and cooldown as observation policy, not a buy signal", () => {
    expect(SHADOW_OBSERVATION_POLICY.version).toBe("shadow-observation-v1");
    expect(SHADOW_OBSERVATION_POLICY.highPriorityMaxSourceRank).toBe(3);
    expect(SHADOW_OBSERVATION_POLICY.cooldownDurationMs).toBe(24 * 60 * 60 * 1000);
    expect(SHADOW_OBSERVATION_POLICY.staleAfterMs).toBe(20 * 60_000);
    expect(isHighPriorityObservation(3)).toBe(true);
    expect(isHighPriorityObservation(4)).toBe(false);
    const policySrc = readFileSync(join(repoRoot, "src/lib/ai-trader/runtime/observation-policy.ts"), "utf8");
    expect(policySrc).toMatch(/not ENTER, buy, order-ready/i);
  });

  it("makes SQL shadow persistence call the RPC instead of split writes", () => {
    const storeSrc = readFileSync(join(repoRoot, "src/lib/ai-trader/persistence/shadow-store.ts"), "utf8");
    expect(storeSrc).toContain("applyWatchlistTransitionRpc");
    expect(storeSrc).not.toContain("INSERT INTO public.ai_trader_watchlist_items");
    expect(storeSrc).not.toContain("INSERT INTO public.ai_trader_watchlist_transitions");
    const proposalSrc = readFileSync(join(repoRoot, "src/lib/ai-trader/persistence/watchlist-store.ts"), "utf8");
    expect(proposalSrc).toContain("applyWatchlistTransitionRpc");
    expect(proposalSrc).not.toMatch(/INSERT INTO public\.ai_trader_watchlist_items/);
    expect(typeof persistWatchlistProposal).toBe("function");
    expect(typeof createSqlShadowPersistence).toBe("function");
  });

  it("hard-gates readiness on the transition RPC and keeps the worker OFF-safe", async () => {
    const persistence = createMemoryShadowPersistence();
    expect(
      evaluateShadowReadiness({
        runtimeSchemaPresent: true,
        watchlistSchemaPresent: true,
        marketAdapter: { async getCandidateBoard() { return []; }, async getSymbolContext() { return null; } },
        sessionPolicyAvailable: true,
        persistence,
        operatingModeReadable: true,
        transitionRpcPresent: false,
      }).status,
    ).toBe("NOT_READY");
    expect(shadowWorkerExecuteAllowed({})).toBe(false);
    const gated = await runShadowWorkerBootstrap(
      {
        readOperatingMode: async () => "SHADOW",
        marketAdapter: { async getCandidateBoard() { return []; }, async getSymbolContext() { return null; } },
        persistence,
        now: () => new Date("2026-09-28T13:35:00.000Z"),
        resolveSession: () => "REGULAR",
      },
      {
        runtimeSchemaPresent: true,
        watchlistSchemaPresent: true,
        marketAdapter: { async getCandidateBoard() { return []; }, async getSymbolContext() { return null; } },
        sessionPolicyAvailable: true,
        persistence,
        operatingModeReadable: true,
        transitionRpcPresent: false,
      },
      { allowExecute: true },
    );
    expect(gated.status).toBe("FAILED");
    expect(gated.reason).toBe("TRANSITION_RPC_MISSING");
    expect(persistence.counts.watchlistWrites).toBe(0);
    expect(AI_TRADER_CURRENT_OPERATING_MODE).toBe("OFF");
    expect(AI_TRADER_SHELL_SNAPSHOT.statusCopy).toBe(AI_TRADER_OFF_COPY);
    expect(AI_TRADER_SHELL_SNAPSHOT.watchlist).toEqual([]);
    const workerMain = readFileSync(join(repoRoot, "services/ai-trader-shadow-worker/src/main.ts"), "utf8");
    expect(workerMain).not.toMatch(/anthropic|openai|alpaca|broker/i);
    expect(workerMain).not.toContain("VITE_");
    expect(workerMain).toContain("Import does nothing");
  });
});
