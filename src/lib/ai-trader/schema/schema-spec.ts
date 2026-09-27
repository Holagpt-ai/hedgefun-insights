export const AI_TRADER_SCHEMA_APPLY_MIGRATION = false;
export const AI_TRADER_SCHEMA_VERSION = "sprint-2b-proposal";
export const AI_TRADER_MEMORY_MIGRATION_FILENAME =
  "20260927220000_ai_trader_memory_foundation_v1.sql";

export type SchemaMutability = "append-only" | "derived-mutable" | "mutable-projection" | "singleton";

export interface AiTraderSchemaTableSpec {
  name: string;
  purpose: string;
  mutability: SchemaMutability;
  indexes: readonly string[];
  relationships: readonly string[];
  vectorSimilarityAppropriate: false;
  existingTableReuse: string;
}

export const AI_TRADER_SCHEMA_TABLES: readonly AiTraderSchemaTableSpec[] = [
  {
    name: "ai_trader_runtime",
    purpose: "Current operating mode and approved config pointers. Mode is never inferred from credentials.",
    mutability: "singleton",
    indexes: ["operating_mode"],
    relationships: ["ai_trader_risk_configs", "ai_trader_strategy_versions"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_accounts",
    purpose: "System-owned trading book identity. No credentials.",
    mutability: "derived-mutable",
    indexes: ["account_id"],
    relationships: ["ai_trader_sessions"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none — not journal_accounts or game_portfolios",
  },
  {
    name: "ai_trader_sessions",
    purpose: "Frozen trading-day context: account, mode, strategy, model assignment, risk config, starting equity.",
    mutability: "append-only",
    indexes: ["account_id,session_date"],
    relationships: ["ai_trader_accounts", "ai_trader_strategy_versions", "ai_trader_model_assignments"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_model_assignments",
    purpose: "Evaluation-driven role assignments. Empty until a suite result and approver exist.",
    mutability: "append-only",
    indexes: ["role,active_from", "evaluation_id"],
    relationships: ["ai_trader_model_evaluations"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_model_evaluations",
    purpose: "Model-evaluation suite results required before live-money roles.",
    mutability: "append-only",
    indexes: ["role,model,dataset_version"],
    relationships: ["ai_trader_model_assignments"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_strategy_versions",
    purpose: "Versioned strategy registry. AI cannot write live-money statuses.",
    mutability: "append-only",
    indexes: ["strategy_id,version"],
    relationships: ["ai_trader_strategy_candidates", "ai_trader_sessions"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_risk_configs",
    purpose: "Versioned risk budgets and gates.",
    mutability: "append-only",
    indexes: ["id"],
    relationships: ["ai_trader_runtime", "ai_trader_sessions"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_context_snapshots",
    purpose: "Immutable decision-time context. Unique on context_hash + schema_version.",
    mutability: "append-only",
    indexes: ["context_hash,schema_version", "symbol,observed_at"],
    relationships: ["ai_trader_sessions", "market_behavior_episodes", "catalyst_events", "radar_v22_board"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "references Radar/catalyst/episode ids; does not copy those tables",
  },
  {
    name: "ai_trader_observations",
    purpose: "Raw facts used to build profiles.",
    mutability: "append-only",
    indexes: ["symbol,observation_type,observed_at"],
    relationships: ["ai_trader_symbol_profiles"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_episodes",
    purpose: "AI experience episodes. Trades point at ai_trader_trades. Market analogs stay in market_behavior_episodes.",
    mutability: "append-only",
    indexes: ["symbol,session_date", "setup_type,session_date", "market_regime,session_date"],
    relationships: ["ai_trader_context_snapshots", "ai_trader_trades", "market_behavior_episodes"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "market_behavior_episodes remains the market-history source of truth",
  },
  {
    name: "ai_trader_symbol_profiles",
    purpose: "Derived rolling symbol beliefs. Versioned with is_current.",
    mutability: "derived-mutable",
    indexes: ["unique symbol where is_current"],
    relationships: ["ai_trader_observations", "security_behavior_profiles"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "security_behavior_profiles is an input, not this table",
  },
  {
    name: "ai_trader_setup_profiles",
    purpose: "Derived setup beliefs.",
    mutability: "derived-mutable",
    indexes: ["setup_key,strategy_version where is_current"],
    relationships: ["ai_trader_episodes"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_regime_profiles",
    purpose: "Derived regime beliefs.",
    mutability: "derived-mutable",
    indexes: ["regime_key where is_current"],
    relationships: ["ai_trader_episodes"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_decision_evidence",
    purpose: "Links decisions to memories actually used.",
    mutability: "append-only",
    indexes: ["decision_id"],
    relationships: ["ai_trader_episodes", "ai_trader_context_snapshots"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_reflections",
    purpose: "Structured post-decision notes. No raw chain-of-thought column.",
    mutability: "append-only",
    indexes: ["trade_id", "decision_id"],
    relationships: ["ai_trader_trades"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none — not journal_ai_memories",
  },
  {
    name: "ai_trader_counterfactuals",
    purpose: "Research alternatives. Cannot update factual trades.",
    mutability: "append-only",
    indexes: ["trade_id", "decision_id"],
    relationships: ["ai_trader_trades"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_strategy_candidates",
    purpose: "Hypotheses only. AI may write PROPOSED.",
    mutability: "append-only",
    indexes: ["status,created_at"],
    relationships: ["ai_trader_strategy_versions", "ai_trader_reflections"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_reward_assessments",
    purpose: "Multi-dimension research scores. Not a governor input. No single reward formula.",
    mutability: "append-only",
    indexes: ["trade_id", "decision_id"],
    relationships: ["ai_trader_reflections"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
];

export function schemaSpecAppliesMigration(): false {
  return AI_TRADER_SCHEMA_APPLY_MIGRATION;
}

export function schemaAllowsVectorColumns(): false {
  return false;
}
