import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AI_TRADER_CURRENT_OPERATING_MODE, AI_TRADER_OFF_COPY } from "@/lib/ai-trader/operating-mode";
import { AI_TRADER_SHELL_SNAPSHOT } from "@/lib/ai-trader/public-snapshot";
import { hashContextSnapshot } from "@/lib/ai-trader/domain/context";
import { isLearnedBelief, isObservation } from "@/lib/ai-trader/domain/memory";
import { createPostgresMemoryProvider } from "@/lib/ai-trader/persistence/postgres-memory-provider";
import { createPostgresExperienceEngine } from "@/lib/ai-trader/persistence/experience-engine";
import * as strategyCandidates from "@/lib/ai-trader/persistence/strategy-candidates";
import {
  buildContextDedupeLookup,
  buildProfileAsOfQuery,
  buildSimilarEpisodesQueryBounded,
  profileQueryUsesCurrentFlag,
  queryHasVectorOrEmbedding,
} from "@/lib/ai-trader/persistence/retrieval-queries";
import { MEMORY_RETRIEVAL_LIMITS } from "@/lib/ai-trader/memory/retrieval-limits";

const repoRoot = process.cwd();

function readRepo(relative: string): string {
  return readFileSync(join(repoRoot, relative), "utf8");
}

describe("AI Trader persistence foundation", () => {
  it("excludes future evidence and bounds retrieval in SQL", () => {
    const similar = buildSimilarEpisodesQueryBounded({
      symbol: "AMC",
      setupType: "vwap_reclaim",
      regimeKey: null,
      asOf: "2026-09-01T14:00:00.000Z",
    });
    expect(similar.text).toContain("started_at <= $1");
    expect(similar.params[0]).toBe("2026-09-01T14:00:00.000Z");
    expect(similar.text).toMatch(/LIMIT \$/);
    expect(similar.params.at(-1)).toBe(MEMORY_RETRIEVAL_LIMITS.maxEpisodes);
    expect(queryHasVectorOrEmbedding(similar.text)).toBe(false);

    const failures = buildSimilarEpisodesQueryBounded({
      symbol: "AMC",
      setupType: null,
      regimeKey: null,
      asOf: "2026-09-01T14:00:00.000Z",
      failuresOnly: true,
    });
    expect(failures.text).toContain("RISK_REJECTION");
    expect(failures.params.at(-1)).toBe(MEMORY_RETRIEVAL_LIMITS.maxFailureExamples);
    expect(failures.text).not.toEqual(similar.text);
  });

  it("looks up profiles historically by generated_at, not is_current", () => {
    const query = buildProfileAsOfQuery("ai_trader_symbol_profiles", "symbol", "AMC", "2026-09-01T14:00:00.000Z");
    expect(query.text).toContain("generated_at <= $2");
    expect(query.params.at(-1)).toBe(1);
    expect(profileQueryUsesCurrentFlag(query.text)).toBe(false);
  });

  it("dedupes context snapshots by hash and schema version", () => {
    const lookup = buildContextDedupeLookup("abc", "v1");
    expect(lookup.params).toEqual(["abc", "v1"]);
    const base = {
      tradingSessionId: null,
      instrument: { symbol: "AMC", assetClass: "US_EQUITY" as const, venue: null },
      observedAt: "2026-09-01T13:31:00.000Z",
      marketSession: "REGULAR",
      operatingMode: "OFF" as const,
      quoteTimestamp: null,
      marketState: { last: 2.51 },
      stocksistSignals: {},
      catalystRefs: [],
      historicalRefs: [],
      sourceProvenance: [],
      schemaVersion: "v1",
    };
    expect(hashContextSnapshot(base)).toBe(hashContextSnapshot({ ...base }));
  });

  it("keeps observation and learned-belief write paths separate", () => {
    expect(isObservation({ kind: "OBSERVATION" })).toBe(true);
    expect(isLearnedBelief({ kind: "LEARNED_BELIEF" })).toBe(true);
    const src = readRepo("src/lib/ai-trader/persistence/postgres-memory-provider.ts");
    expect(src).toContain("ai_trader_observations");
    expect(src).toContain("ai_trader_episodes");
    expect(src).not.toMatch(/INSERT INTO public\.ai_trader_symbol_profiles/);
  });

  it("can create PROPOSED candidates and has no promotion API", () => {
    expect(strategyCandidates.insertProposedStrategyCandidate).toBeTypeOf("function");
    expect(strategyCandidates).not.toHaveProperty("setStatus");
    expect(strategyCandidates).not.toHaveProperty("promoteStrategyCandidate");
    expect(Object.keys(strategyCandidates)).toEqual(["insertProposedStrategyCandidate"]);
  });

  it("does not bind a browser Supabase client or persist on import", () => {
    const providerSrc = readRepo("src/lib/ai-trader/persistence/postgres-memory-provider.ts");
    expect(providerSrc).not.toContain("@/integrations/supabase/client");
    expect(providerSrc).not.toContain("VITE_SUPABASE");
    createPostgresMemoryProvider({
      query: async () => {
        throw new Error("executor must not run unless invoked");
      },
    });
    createPostgresExperienceEngine(createPostgresMemoryProvider({ query: async () => [] }));
  });

  it("keeps the OFF shell free of persistence and trading evidence", () => {
    expect(AI_TRADER_CURRENT_OPERATING_MODE).toBe("OFF");
    expect(AI_TRADER_SHELL_SNAPSHOT.statusCopy).toBe(AI_TRADER_OFF_COPY);
    expect(AI_TRADER_SHELL_SNAPSHOT.watchlist).toEqual([]);
    expect(AI_TRADER_SHELL_SNAPSHOT.positions).toEqual([]);
    expect(AI_TRADER_SHELL_SNAPSHOT.trades).toEqual([]);
    expect(AI_TRADER_SHELL_SNAPSHOT.pnl).toBeNull();

    const shellImports = [
      "src/pages/dashboard/AiTraderPage.tsx",
      "src/features/ai-trader/AiTraderWorkspace.tsx",
      "src/features/ai-trader/AiTraderPreviewDialog.tsx",
      "src/components/home/AiTraderLivePreview.tsx",
      "src/lib/ai-trader/public-snapshot.ts",
    ];
    for (const file of shellImports) {
      const src = readRepo(file);
      expect(src).not.toContain("ai-trader/persistence");
      expect(src).not.toContain("createPostgresMemoryProvider");
    }
  });

  it("authors a migration without vectors, chain-of-thought, credentials, or broker code", () => {
    const sql = readRepo("supabase/migrations/20260927220000_ai_trader_memory_foundation_v1.sql");
    expect(sql).toContain("CREATE TABLE public.ai_trader_observations");
    expect(sql).toContain("UNIQUE (context_hash, schema_version)");
    expect(sql).toContain("generated_at");
    expect(sql).not.toMatch(/CREATE EXTENSION|vector\(/i);
    expect(sql).not.toContain("chain_of_thought");
    expect(sql).not.toContain("raw_reasoning");
    expect(sql).not.toMatch(/api_key\s+text/i);
    expect(sql).not.toContain("alpaca");
    expect(sql).not.toContain("CREATE TABLE public.ai_trader_orders");
    expect(sql).toContain("GRANT ALL ON TABLE public.%I TO service_role");
    expect(sql).toContain("REVOKE ALL ON TABLE public.%I FROM authenticated");
  });
});
