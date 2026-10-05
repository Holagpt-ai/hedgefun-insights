import type { KillSwitchActivation, KillSwitchSemantic } from "@/lib/execution/kill-switch/types";

export interface KillSwitchStore {
  getActivations(): readonly KillSwitchActivation[];
  activate(activation: KillSwitchActivation): void;
  clear(scope: KillSwitchActivation["scope"], key?: string): void;
  clearAll(): void;
}

export function createInMemoryKillSwitchStore(): KillSwitchStore {
  const activations: KillSwitchActivation[] = [];

  return {
    getActivations: () => [...activations],
    activate(activation) {
      activations.push({ ...activation, semantics: [...activation.semantics] });
    },
    clear(scope, key) {
      for (let i = activations.length - 1; i >= 0; i -= 1) {
        const a = activations[i];
        if (a.scope !== scope) continue;
        if (scope === "GLOBAL") {
          activations.splice(i, 1);
          continue;
        }
        if (scope === "STRATEGY" && a.strategyId === key) activations.splice(i, 1);
        if (scope === "SYMBOL" && a.symbol === key) activations.splice(i, 1);
      }
    },
    clearAll() {
      activations.length = 0;
    },
  };
}

export function killSwitchBlocksNewEntries(
  store: KillSwitchStore,
  input: { strategyId: string; symbol: string },
): KillSwitchActivation | null {
  for (const a of store.getActivations()) {
    if (!a.semantics.includes("BLOCK_NEW_ENTRIES" as KillSwitchSemantic)) continue;
    if (a.scope === "GLOBAL") return a;
    if (a.scope === "STRATEGY" && a.strategyId === input.strategyId) return a;
    if (a.scope === "SYMBOL" && a.symbol === input.symbol.toUpperCase()) return a;
  }
  return null;
}
