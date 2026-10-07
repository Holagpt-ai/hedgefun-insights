/**
 * Tracks trade intents that already completed orchestration (success or terminal failure).
 * Prevents duplicate broker submissions for the same stable intent id.
 */
export interface IntentDedupeStore {
  hasProcessed(tradeIntentId: string): boolean;
  markProcessed(tradeIntentId: string): void;
  clear(): void;
}

export function createInMemoryIntentDedupeStore(): IntentDedupeStore {
  const processed = new Set<string>();
  return {
    hasProcessed(id) {
      return processed.has(id);
    },
    markProcessed(id) {
      processed.add(id);
    },
    clear() {
      processed.clear();
    },
  };
}
