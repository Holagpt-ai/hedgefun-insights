export const AI_TRADER_SCHEMA_APPLY_MIGRATION = false;
export const AI_TRADER_SCHEMA_VERSION = "sprint-3a-watchlist-proposal";
export const AI_TRADER_MEMORY_MIGRATION_FILENAME =
  "20260927220000_ai_trader_memory_foundation_v1.sql";
export const AI_TRADER_WATCHLIST_MIGRATION_FILENAME =
  "20260927230000_ai_trader_watchlist_foundation_v1.sql";
export const AI_TRADER_WATCHLIST_APPLY_MIGRATION = false;
export const AI_TRADER_DATABASE_TARGET = "EXISTING_STOCKSIST_LOVABLE_SUPABASE" as const;
export const AI_TRADER_LOVABLE_DRIZZLE_MEMORY_MIRROR =
  "drizzle/migrations/0051_ai_trader_memory_foundation_v1.sql";

export type SchemaMutability =
  | "strict-append-only"
  | "versioned-profile"
  | "controlled-lifecycle"
  | "mutable-current-state"
  | "deferred-append-only";

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
    mutability: "mutable-current-state",
    indexes: ["operating_mode"],
    relationships: ["ai_trader_risk_configs", "ai_trader_strategy_versions"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_accounts",
    purpose: "System-owned trading book identity. No credentials.",
    mutability: "mutable-current-state",
    indexes: ["account_id"],
    relationships: ["ai_trader_sessions"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none — not journal_accounts or game_portfolios",
  },
  {
    name: "ai_trader_sessions",
    purpose: "Trading-day session. Identity freezes after CREATED. Status is a controlled lifecycle.",
    mutability: "controlled-lifecycle",
    indexes: ["account_id,session_date"],
    relationships: ["ai_trader_accounts", "ai_trader_strategy_versions", "ai_trader_model_assignments"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_model_assignments",
    purpose: "Evaluation-driven role assignments. Identity immutable. active_until may close once.",
    mutability: "controlled-lifecycle",
    indexes: ["role,active_from", "evaluation_id"],
    relationships: ["ai_trader_model_evaluations"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_model_evaluations",
    purpose: "Model-evaluation suite results required before live-money roles.",
    mutability: "deferred-append-only",
    indexes: ["role,model,dataset_version"],
    relationships: ["ai_trader_model_assignments"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_strategy_versions",
    purpose: "Versioned strategy registry. Identity immutable. Trusted services may update lifecycle fields. AI cannot promote.",
    mutability: "controlled-lifecycle",
    indexes: ["strategy_id,version"],
    relationships: ["ai_trader_strategy_candidates", "ai_trader_sessions"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_risk_configs",
    purpose: "Versioned risk budgets and gates.",
    mutability: "deferred-append-only",
    indexes: ["id"],
    relationships: ["ai_trader_runtime", "ai_trader_sessions"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_context_snapshots",
    purpose: "Immutable decision-time context. Unique on context_hash + schema_version.",
    mutability: "strict-append-only",
    indexes: ["context_hash,schema_version", "symbol,observed_at"],
    relationships: ["ai_trader_sessions", "market_behavior_episodes", "catalyst_events", "radar_v22_board"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "references Radar/catalyst/episode ids; does not copy those tables",
  },
  {
    name: "ai_trader_observations",
    purpose: "Raw facts used to build profiles.",
    mutability: "strict-append-only",
    indexes: ["symbol,observation_type,observed_at"],
    relationships: ["ai_trader_symbol_profiles"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_episodes",
    purpose: "AI experience episodes. Trades point at ai_trader_trades. Market analogs stay in market_behavior_episodes.",
    mutability: "strict-append-only",
    indexes: ["symbol,session_date", "setup_type,session_date", "market_regime,session_date"],
    relationships: ["ai_trader_context_snapshots", "ai_trader_trades", "market_behavior_episodes"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "market_behavior_episodes remains the market-history source of truth",
  },
  {
    name: "ai_trader_symbol_profiles",
    purpose: "Derived rolling symbol beliefs. Versioned with is_current.",
    mutability: "versioned-profile",
    indexes: ["unique symbol where is_current"],
    relationships: ["ai_trader_observations", "security_behavior_profiles"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "security_behavior_profiles is an input, not this table",
  },
  {
    name: "ai_trader_setup_profiles",
    purpose: "Derived setup beliefs.",
    mutability: "versioned-profile",
    indexes: ["setup_key,strategy_version where is_current"],
    relationships: ["ai_trader_episodes"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_regime_profiles",
    purpose: "Derived regime beliefs.",
    mutability: "versioned-profile",
    indexes: ["regime_key where is_current"],
    relationships: ["ai_trader_episodes"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_decision_evidence",
    purpose: "Links decisions to memories actually used.",
    mutability: "strict-append-only",
    indexes: ["decision_id"],
    relationships: ["ai_trader_episodes", "ai_trader_context_snapshots"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_reflections",
    purpose: "Structured post-decision notes. No raw chain-of-thought column.",
    mutability: "strict-append-only",
    indexes: ["trade_id", "decision_id"],
    relationships: ["ai_trader_trades"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none — not journal_ai_memories",
  },
  {
    name: "ai_trader_counterfactuals",
    purpose: "Research alternatives. Cannot update factual trades.",
    mutability: "strict-append-only",
    indexes: ["trade_id", "decision_id"],
    relationships: ["ai_trader_trades"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_strategy_candidates",
    purpose: "Hypotheses only. AI may insert PROPOSED. Trusted services may later change status. DATABASE CAPABILITY != AI AUTHORITY.",
    mutability: "controlled-lifecycle",
    indexes: ["status,created_at"],
    relationships: ["ai_trader_strategy_versions", "ai_trader_reflections"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_reward_assessments",
    purpose: "Multi-dimension research scores. Not a governor input. No single reward formula.",
    mutability: "strict-append-only",
    indexes: ["trade_id", "decision_id"],
    relationships: ["ai_trader_reflections"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_audit_events",
    purpose: "Append-only audit trail. No secrets. No raw chain-of-thought.",
    mutability: "strict-append-only",
    indexes: ["occurred_at", "session_id"],
    relationships: [],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
  {
    name: "ai_trader_watchlist_items",
    purpose: "Autonomous system-book watchlist current state. Not user watchlists.",
    mutability: "mutable-current-state",
    indexes: ["symbol unique", "state,source_rank"],
    relationships: ["ai_trader_watchlist_transitions", "ai_trader_context_snapshots"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none — not watchlists",
  },
  {
    name: "ai_trader_watchlist_transitions",
    purpose: "Append-only autonomous watchlist audit history.",
    mutability: "strict-append-only",
    indexes: ["watchlist_item_id,occurred_at"],
    relationships: ["ai_trader_watchlist_items"],
    vectorSimilarityAppropriate: false,
    existingTableReuse: "none",
  },
];

export interface MutabilityMatrixRow {
  table: string;
  mutability: SchemaMutability | "versioned-profile";
  allowedUpdateFields: readonly string[];
  deleteAllowed: false;
  dbEnforcement: string;
}

export const AI_TRADER_MUTABILITY_MATRIX: readonly MutabilityMatrixRow[] = [
  {
    table: "ai_trader_context_snapshots",
    mutability: "strict-append-only",
    allowedUpdateFields: [],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_reject_mutation UPDATE/DELETE",
  },
  {
    table: "ai_trader_observations",
    mutability: "strict-append-only",
    allowedUpdateFields: [],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_reject_mutation UPDATE/DELETE",
  },
  {
    table: "ai_trader_episodes",
    mutability: "strict-append-only",
    allowedUpdateFields: [],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_reject_mutation UPDATE/DELETE",
  },
  {
    table: "ai_trader_decision_evidence",
    mutability: "strict-append-only",
    allowedUpdateFields: [],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_reject_mutation UPDATE/DELETE",
  },
  {
    table: "ai_trader_reflections",
    mutability: "strict-append-only",
    allowedUpdateFields: [],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_reject_mutation UPDATE/DELETE",
  },
  {
    table: "ai_trader_counterfactuals",
    mutability: "strict-append-only",
    allowedUpdateFields: [],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_reject_mutation UPDATE/DELETE",
  },
  {
    table: "ai_trader_reward_assessments",
    mutability: "strict-append-only",
    allowedUpdateFields: [],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_reject_mutation UPDATE/DELETE",
  },
  {
    table: "ai_trader_audit_events",
    mutability: "strict-append-only",
    allowedUpdateFields: [],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_reject_mutation UPDATE/DELETE",
  },
  {
    table: "ai_trader_symbol_profiles",
    mutability: "versioned-profile",
    allowedUpdateFields: ["is_current"],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_allow_is_current_clear; replace RPC; DELETE rejected",
  },
  {
    table: "ai_trader_setup_profiles",
    mutability: "versioned-profile",
    allowedUpdateFields: ["is_current"],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_allow_is_current_clear; replace RPC; DELETE rejected",
  },
  {
    table: "ai_trader_regime_profiles",
    mutability: "versioned-profile",
    allowedUpdateFields: ["is_current"],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_allow_is_current_clear; replace RPC; DELETE rejected",
  },
  {
    table: "ai_trader_sessions",
    mutability: "controlled-lifecycle",
    allowedUpdateFields: ["status", "started_at", "ended_at", "identity_while_CREATED"],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_session_lifecycle_guard",
  },
  {
    table: "ai_trader_model_assignments",
    mutability: "controlled-lifecycle",
    allowedUpdateFields: ["active_until"],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_model_assignment_lifecycle_guard; active_until NULL→timestamp once",
  },
  {
    table: "ai_trader_strategy_versions",
    mutability: "controlled-lifecycle",
    allowedUpdateFields: [
      "status",
      "approved_at",
      "approved_by",
      "backtest_evaluation_id",
      "shadow_evaluation_id",
      "paper_evaluation_id",
      "allowed_modes",
    ],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_strategy_version_lifecycle_guard; AI adapter cannot promote",
  },
  {
    table: "ai_trader_strategy_candidates",
    mutability: "controlled-lifecycle",
    allowedUpdateFields: ["status"],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_strategy_candidate_lifecycle_guard; AI insert PROPOSED only",
  },
  {
    table: "ai_trader_runtime",
    mutability: "mutable-current-state",
    allowedUpdateFields: ["operating_mode", "active_strategy_version_id", "active_risk_config_id", "updated_at", "updated_by"],
    deleteAllowed: false,
    dbEnforcement: "RLS/grants only; singleton id=1",
  },
  {
    table: "ai_trader_accounts",
    mutability: "mutable-current-state",
    allowedUpdateFields: ["broker_provider", "broker_account_ref", "environment", "status", "updated_at", "asset_permissions"],
    deleteAllowed: false,
    dbEnforcement: "RLS/grants only; no credentials columns",
  },
  {
    table: "ai_trader_watchlist_items",
    mutability: "mutable-current-state",
    allowedUpdateFields: ["state", "last_evaluated_at", "current_priority", "source_rank", "reason_codes", "updated_at"],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_watchlist_item_guard; identity frozen",
  },
  {
    table: "ai_trader_watchlist_transitions",
    mutability: "strict-append-only",
    allowedUpdateFields: [],
    deleteAllowed: false,
    dbEnforcement: "ai_trader_reject_mutation UPDATE/DELETE",
  },
];

export function schemaSpecAppliesMigration(): false {
  return AI_TRADER_SCHEMA_APPLY_MIGRATION;
}

export function schemaAllowsVectorColumns(): false {
  return false;
}

export function schemaAppliesWatchlistMigration(): false {
  return AI_TRADER_WATCHLIST_APPLY_MIGRATION;
}
