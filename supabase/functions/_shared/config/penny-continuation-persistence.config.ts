/** Batch 226 — Penny workflow handoff persistence bounds (not production-activated). */

export const PENNY_CONTINUATION_HANDOFF_LIST_DEFAULT_LIMIT = 200;
export const PENNY_CONTINUATION_HANDOFF_LIST_MAX_LIMIT = 500;

export const PENNY_CONTINUATION_HANDOFF_UPSERT_RPC =
  "penny_continuation_handoff_upsert_v1";
export const PENNY_CONTINUATION_HANDOFF_LIST_ACTIVE_RPC =
  "penny_continuation_handoff_list_active_v1";
export const PENNY_CONTINUATION_HANDOFF_REVOKE_RPC =
  "penny_continuation_handoff_revoke_v1";
export const PENNY_CONTINUATION_HANDOFF_EXPIRE_STALE_RPC =
  "penny_continuation_handoff_expire_stale_v1";
