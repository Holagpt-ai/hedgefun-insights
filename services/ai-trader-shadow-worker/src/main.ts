/**
 * Future trusted-server entry. Import does nothing.
 * Do not deploy. Do not activate SHADOW. Do not start a cron.
 */
import {
  readShadowWorkerEnv,
  runShadowWorkerBootstrap,
  shadowWorkerExecuteAllowed,
} from "@/lib/ai-trader/runtime/shadow-worker-bootstrap";

export { readShadowWorkerEnv, shadowWorkerExecuteAllowed, runShadowWorkerBootstrap };

export async function main(env: NodeJS.Dict<string> = process.env): Promise<number> {
  if (!shadowWorkerExecuteAllowed(env)) {
    console.info(JSON.stringify({
      event: "shadow_worker_idle",
      reason: "EXECUTE_NOT_ALLOWED",
      message: "AI_TRADER_SHADOW_WORKER_ALLOW_EXECUTE is not 1. Refusing to start.",
    }));
    return 0;
  }

  const parsed = readShadowWorkerEnv(env);
  if ("error" in parsed) {
    console.error(JSON.stringify({ event: "shadow_worker_refused", reason: parsed.error }));
    return 1;
  }

  console.info(JSON.stringify({
    event: "shadow_worker_refused",
    reason: "NOT_DEPLOYED",
    message: "Sprint 3C.1 authors the worker package. It does not connect or write.",
    hasSupabaseUrl: Boolean(parsed.supabaseUrl),
    hasServiceRoleKey: Boolean(parsed.supabaseServiceRoleKey),
  }));
  return 0;
}

const launchedDirectly = process.env.AI_TRADER_SHADOW_WORKER_PROCESS === "1";
if (launchedDirectly) {
  void main().then((code) => process.exit(code));
}
