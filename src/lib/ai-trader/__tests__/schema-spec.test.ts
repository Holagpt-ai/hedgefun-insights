import { describe, expect, it } from "vitest";
import {
  AI_TRADER_DATABASE_TARGET,
  AI_TRADER_MEMORY_MIGRATION_FILENAME,
  AI_TRADER_MUTABILITY_MATRIX,
  AI_TRADER_SCHEMA_APPLY_MIGRATION,
  AI_TRADER_SCHEMA_TABLES,
  schemaAllowsVectorColumns,
  schemaSpecAppliesMigration,
} from "@/lib/ai-trader/schema/schema-spec";

describe("AI Trader schema proposal", () => {
  it("does not apply a migration and does not introduce vectors", () => {
    expect(AI_TRADER_SCHEMA_APPLY_MIGRATION).toBe(false);
    expect(AI_TRADER_MEMORY_MIGRATION_FILENAME).toBe(
      "20260927220000_ai_trader_memory_foundation_v1.sql",
    );
    expect(schemaSpecAppliesMigration()).toBe(false);
    expect(schemaAllowsVectorColumns()).toBe(false);
    expect(AI_TRADER_SCHEMA_TABLES.every((table) => table.vectorSimilarityAppropriate === false)).toBe(true);
  });

  it("keeps memory tables distinct from Journal and Game books", () => {
    const names = AI_TRADER_SCHEMA_TABLES.map((table) => table.name);
    expect(names).toContain("ai_trader_context_snapshots");
    expect(names).toContain("ai_trader_observations");
    expect(names).toContain("ai_trader_episodes");
    expect(names).toContain("ai_trader_accounts");
    expect(names).toContain("ai_trader_sessions");
    expect(names).toContain("ai_trader_model_assignments");
    expect(names).toContain("ai_trader_strategy_versions");
    expect(names).not.toContain("journal_trades");
    expect(names).not.toContain("game_trades");
    expect(AI_TRADER_SCHEMA_TABLES.find((table) => table.name === "ai_trader_episodes")?.existingTableReuse).toMatch(
      /market_behavior_episodes/,
    );
    expect(AI_TRADER_DATABASE_TARGET).toBe("EXISTING_STOCKSIST_LOVABLE_SUPABASE");
    expect(AI_TRADER_SCHEMA_TABLES.find((table) => table.name === "ai_trader_sessions")?.mutability).toBe(
      "controlled-lifecycle",
    );
    expect(AI_TRADER_MUTABILITY_MATRIX.every((row) => row.deleteAllowed === false)).toBe(true);
  });
});
