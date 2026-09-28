/**
 * Trusted server entry for the AI Trader Shadow worker.
 * Import does not start a cycle and does not change operating mode.
 * OFF mode stays SKIPPED / OPERATING_MODE_OFF and writes nothing.
 */
import { runShadowWorkerProcess } from "@/lib/ai-trader/runtime/shadow-worker-process";

export { runShadowWorkerProcess };

export async function main(env: NodeJS.Dict<string> = process.env): Promise<number> {
  return runShadowWorkerProcess(env);
}

function launchedDirectly(): boolean {
  if (process.env.AI_TRADER_SHADOW_WORKER_PROCESS === "1") return true;
  const event = process.env.npm_lifecycle_event;
  if (event === "start" || event === "dev") return true;
  const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
  return entry.endsWith("/worker.mjs") || entry.endsWith("/services/ai-trader-shadow-worker/src/main.ts");
}

if (launchedDirectly()) {
  void main().then((code) => process.exit(code));
}
