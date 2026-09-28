import type { Server } from "node:http";
import {
  readShadowWorkerConfig,
  type ShadowWorkerConfig,
} from "@/lib/ai-trader/runtime/env-contract";
import { createLeveledShadowLogger } from "@/lib/ai-trader/runtime/logger";
import { startShadowWorkerHealthServer } from "@/lib/ai-trader/runtime/shadow-worker-health";
import { openProductionShadowWorker, type ConnectedShadowWorker } from "@/lib/ai-trader/runtime/shadow-worker-production";
import {
  createShadowWorkerSupervisor,
  type ShadowWorkerHealthSnapshot,
} from "@/lib/ai-trader/runtime/shadow-worker-supervisor";

export interface ShadowWorkerProcessDeps {
  connect?: (config: ShadowWorkerConfig) => Promise<ConnectedShadowWorker>;
  listen?: (
    port: number,
    snapshot: () => ShadowWorkerHealthSnapshot,
  ) => Promise<{ close(): void | Promise<void> }>;
  signal?: AbortSignal;
}

function publicConfigMessage(message: string): string {
  if (/postgres(ql)?:\/\//i.test(message) || /password|eyJ[A-Za-z0-9_-]{8,}/i.test(message)) {
    return "CONFIGURATION_ERROR";
  }
  return message;
}

async function closeServer(server: Server | { close(): void | Promise<void> }): Promise<void> {
  if ("listening" in server) {
    await new Promise<void>((resolve) => {
      (server as Server).close(() => resolve());
    });
    return;
  }
  await server.close();
}

/**
 * Process bootstrap. Importing this module does not start a cycle and does not change operating mode.
 * Missing configuration fails closed before any database call.
 */
export async function runShadowWorkerProcess(
  env: NodeJS.Dict<string> = process.env,
  deps: ShadowWorkerProcessDeps = {},
): Promise<number> {
  const parsed = readShadowWorkerConfig(env);
  if ("error" in parsed) {
    console.error(JSON.stringify({
      event: "shadow_worker_refused",
      reason: "CONFIGURATION_ERROR",
      message: publicConfigMessage(parsed.message),
    }));
    return 1;
  }

  const logger = createLeveledShadowLogger(parsed.logLevel);
  let connected: ConnectedShadowWorker;
  try {
    const connect = deps.connect ?? ((config: ShadowWorkerConfig) => openProductionShadowWorker(config, logger, env));
    connected = await connect(parsed);
  } catch (error) {
    console.error(JSON.stringify({
      event: "shadow_worker_refused",
      reason: "CONFIGURATION_ERROR",
      message: publicConfigMessage(error instanceof Error ? error.message : "CONFIGURATION_ERROR"),
    }));
    return 1;
  }

  const supervisor = createShadowWorkerSupervisor(connected.host, {
    workerId: parsed.workerId,
    gitSha: parsed.gitSha,
    intervalMs: parsed.pollIntervalMs,
    logger,
  });

  const onStop = () => controller.abort();
  const controller = new AbortController();
  let server: Server | { close(): void | Promise<void> } | null = null;
  try {
    server = deps.listen
      ? await deps.listen(parsed.healthPort, () => supervisor.healthSnapshot())
      : await startShadowWorkerHealthServer(parsed.healthPort, () => supervisor.healthSnapshot());
    if (deps.signal) {
      if (deps.signal.aborted) controller.abort();
      else deps.signal.addEventListener("abort", onStop, { once: true });
    } else {
      process.once("SIGTERM", onStop);
      process.once("SIGINT", onStop);
    }
    await supervisor.run(controller.signal);
    return 0;
  } catch (error) {
    logger.error("shadow_worker_refused", {
      reason: "CONFIGURATION_ERROR",
      message: publicConfigMessage(error instanceof Error ? error.message : "health bind failed"),
    });
    return 1;
  } finally {
    process.removeListener("SIGTERM", onStop);
    process.removeListener("SIGINT", onStop);
    if (server) await closeServer(server);
    await connected.close();
    logger.info("shadow_worker_stopped", { workerId: parsed.workerId });
  }
}
