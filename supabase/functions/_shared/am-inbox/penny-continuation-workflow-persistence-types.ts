/**
 * Batch 226 — Penny Continuation workflow handoff persistence row contract (service-role upsert).
 */

export type PennyContinuationHandoffUpsertRow = {
  security_id?: string | null;
  symbol: string;
  source_session_date: string;
  capture_at: string;
  symbol_observation_at?: string | null;
  handoff_version: string;
  integration_version: string;
  model_version: string;
  publication_idempotency_key: string;
  observation_generation_id: string;
  generation_sync_ms: number;
  generation_sync_at: string;
  continuation_qualified: boolean;
  publication_suppressed: boolean;
  qualification_evidence_kind: "live_market" | "prior_session_capture";
  valid_from_session_date: string;
  valid_through_session_date: string;
  badge_payload: Record<string, unknown>;
  rank_snapshot: Record<string, unknown>;
};

export type PennyHandoffUpsertRpcResult = {
  applied: boolean;
  reason?:
    | "stale_generation"
    | "already_current"
    | "revoked"
    | "invalid_body"
    | "inserted"
    | "updated";
};
