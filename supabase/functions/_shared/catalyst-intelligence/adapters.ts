// Provider adapter boundary. V1 never executes adapters.
// Intelligence consumes already-normalized catalyst_events only.
// No live provider clients and no notification transports live here.

import type { ProviderAdapterName, ProviderAdapterResult } from "./types.ts";

export const PROVIDER_ADAPTERS_DISABLED_REASON = "PROVIDER_ADAPTERS_DISABLED_IN_V1" as const;

export function executeProviderAdapter(
  name: ProviderAdapterName | string,
): ProviderAdapterResult {
  return {
    executed: false,
    reason: PROVIDER_ADAPTERS_DISABLED_REASON,
    adapter: typeof name === "string" && name.length > 0 ? name : "unknown",
  };
}

export function listExecutableAdapters(): readonly string[] {
  return [];
}
