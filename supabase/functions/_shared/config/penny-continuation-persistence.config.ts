/** Batch 226 — Penny workflow handoff persistence bounds (not production-activated). */

export const PENNY_CONTINUATION_HANDOFF_READ_MAX_PAIRS = 64;
export const PENNY_CONTINUATION_HANDOFF_READ_PROJECTION_VERSION =
  "penny_continuation_handoff_read_v1" as const;

export const PENNY_CONTINUATION_HANDOFF_UPSERT_RPC =
  "penny_continuation_handoff_upsert_v1";
export const PENNY_CONTINUATION_HANDOFF_LIST_ACTIVE_RPC =
  "penny_continuation_handoff_list_active_v1";
export const PENNY_CONTINUATION_HANDOFF_REVOKE_RPC =
  "penny_continuation_handoff_revoke_v1";
export const PENNY_CONTINUATION_HANDOFF_EXPIRE_STALE_RPC =
  "penny_continuation_handoff_expire_stale_v1";
