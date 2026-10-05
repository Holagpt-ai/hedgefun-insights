export const KILL_SWITCH_SCOPES = ["GLOBAL", "STRATEGY", "SYMBOL"] as const;
export type KillSwitchScope = (typeof KILL_SWITCH_SCOPES)[number];

export const KILL_SWITCH_SEMANTICS = [
  "BLOCK_NEW_ENTRIES",
  "CANCEL_PENDING",
  "FLATTEN_POSITION",
  "FLATTEN_ALL",
] as const;

export type KillSwitchSemantic = (typeof KILL_SWITCH_SEMANTICS)[number];

export interface KillSwitchActivation {
  scope: KillSwitchScope;
  /** Required when scope is STRATEGY or SYMBOL. */
  strategyId?: string;
  symbol?: string;
  semantics: readonly KillSwitchSemantic[];
  activatedAt: string;
  reason: string;
}
