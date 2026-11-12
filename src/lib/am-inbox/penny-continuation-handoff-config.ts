/** Client mirror of Batch 226 persistence bounds. */

export const PENNY_CONTINUATION_HANDOFF_READ_MAX_PAIRS = 64;
export const PENNY_CONTINUATION_HANDOFF_READ_PROJECTION_VERSION =
  "penny_continuation_handoff_read_v1" as const;

export type PennyHandoffReadPair = {
  symbol: string;
  sourceSessionDate: string;
};
