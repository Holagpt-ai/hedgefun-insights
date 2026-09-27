import type { ShadowRuntimeDeps } from "@/lib/ai-trader/runtime/shadow-runtime";
import { createAiTraderShadowRuntime } from "@/lib/ai-trader/runtime/shadow-runtime";

/**
 * Explicit worker entry only. Importing this module does not start a cycle
 * and does not change operating mode.
 */
export async function runShadowWorkerEntrypoint(
  deps: ShadowRuntimeDeps,
  options: { allowExecute: true },
): Promise<void> {
  if (!options.allowExecute) {
    throw new Error("Shadow worker entrypoint requires explicit allowExecute");
  }
  const runtime = createAiTraderShadowRuntime(deps);
  await runtime.runCycle();
}
