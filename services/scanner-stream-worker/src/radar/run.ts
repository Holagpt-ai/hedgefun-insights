import type { CalendarExceptionLoader } from "../baseline/persist.ts";
import type { FetchLike } from "../baseline/grouped.ts";
import type { WorkerEnv } from "../env.ts";
import { log } from "../log.ts";
import { isoFromMs } from "./time.ts";
import { mergeRadarConfig, type RadarV22Config } from "./config.ts";
import { createRadarEngine } from "./engine.ts";
import { createRadarBridge } from "../bridge.ts";
import { type LeaseClient } from "./lease.ts";
import {
  publishRadarGeneration,
  type RadarRpcFn,
  type SetStatusFn,
} from "./persist.ts";
import { refreshEligibleUniverse } from "./snapshot.ts";
import type { RadarConnectionState, RadarHealthSnapshot } from "./types.ts";
import { createRadarSocket, type RadarWsConnect } from "./ws.ts";

export type RadarHealthSink = {
  applyRadar(snapshot: RadarHealthSnapshot): void;
};

function interruptibleSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export type RadarRuntime = {
  stop: () => Promise<void>;
};

export function startRadarV22(opts: {
  env: WorkerEnv;
  fetch: FetchLike;
  loadExceptions: CalendarExceptionLoader;
  health: RadarHealthSink;
  signal: AbortSignal;
  config?: Partial<RadarV22Config>;
  connect?: RadarWsConnect;
  nowMs?: () => number;
  newId?: () => string;
  sleep?: (ms: number) => Promise<void>;
  lease?: LeaseClient;
  rpc?: RadarRpcFn;
  setStatus?: SetStatusFn;
  holderId?: string;
}): RadarRuntime {
  const config = mergeRadarConfig(opts.config);
  const nowMs = opts.nowMs ?? (() => Date.now());
  const newId = opts.newId ?? (() => crypto.randomUUID());
  const sleep = opts.sleep ??
    ((ms) => interruptibleSleep(ms, opts.signal));
  const bridged = createRadarBridge({
    bridgeUrl: opts.env.radarBridgeUrl,
    workerSecret: opts.env.radarWorkerSecret,
    fetch: opts.fetch,
    sleep: opts.sleep,
  });
  const lease = opts.lease ?? bridged.lease;
  const rpc = opts.rpc ?? bridged.radarRpc;
  const setStatus = opts.setStatus ?? bridged.setStatus;
  const holderId = opts.holderId ?? `radar-${crypto.randomUUID()}`;
  const engine = createRadarEngine({ config, exceptions: [] });
  let leaseHeld = false;
  let connectionState: RadarConnectionState = "idle";
  let lastPublishedGeneration: string | null = null;
  let running = true;
  let socket: ReturnType<typeof createRadarSocket> | null = null;

  function healthSnapshot(
    status: RadarHealthSnapshot["status"],
  ): RadarHealthSnapshot {
    const counters = engine.counters();
    const board = engine.snapshot();
    const eventMs = engine.eventNowMs();
    return {
      status,
      connection_state: connectionState,
      last_provider_event_at: eventMs !== null ? isoFromMs(eventMs) : null,
      last_published_generation: lastPublishedGeneration ??
        board.generationId,
      active_symbol_count:
        board.rows.filter((row) =>
          row.lifecycle === "ACTIVE" || row.lifecycle === "REACTIVATED"
        ).length,
      correction_count: counters.correctionCount,
      duplicate_count: counters.duplicateCount,
      out_of_order_count: counters.outOfOrderCount,
      reconnect_count: counters.reconnectCount,
      lease_held: leaseHeld,
    };
  }

  function pushHealth(status: RadarHealthSnapshot["status"]): void {
    opts.health.applyRadar(healthSnapshot(status));
  }

  pushHealth("degraded");

  const evaluateAndPublish = async () => {
    const generationId = newId();
    const wallNow = nowMs();
    const result = engine.evaluate(wallNow, generationId);
    if (result.staleTransition) {
      const syncedAt = isoFromMs(wallNow) ?? new Date(wallNow).toISOString();
      await setStatus({
        p_status: result.board.rows.length > 0 ? "stale" : "empty",
        p_last_provider_event_at: result.board.lastProviderEventAt,
        p_synced_at: syncedAt,
      });
      pushHealth("stale");
      return;
    }
    if (!result.published) {
      pushHealth(leaseHeld ? "running" : "degraded");
      return;
    }
    const syncedAt = isoFromMs(wallNow) ?? new Date(wallNow).toISOString();
    const published = await publishRadarGeneration(rpc, {
      p_generation_id: generationId,
      p_rows: result.board.rows.map((row) => ({
        ...row,
        generation_id: generationId,
        updated_at: syncedAt,
      })),
      p_archive: result.board.archives.map((row) => ({
        ...row,
        generation_id: generationId,
        archived_at: syncedAt,
      })),
      p_session_date: result.board.sessionDate,
      p_synced_at: syncedAt,
      p_status: result.board.status,
      p_last_provider_event_at: result.board.lastProviderEventAt,
    });
    if (published.ok) {
      lastPublishedGeneration = generationId;
    } else {
      log("error", "radar_persist_failed", { code: published.code });
    }
    pushHealth(result.board.feedStale ? "stale" : "running");
  };

  const startSocket = () => {
    socket?.stop();
    socket = createRadarSocket({
      mode: opts.env.massiveWsMode,
      apiKey: opts.env.polygonApiKey,
      config,
      connect: opts.connect,
      sleep,
      nowMs,
      onEvent: (raw, receiveMs) => {
        engine.ingest(raw, receiveMs);
      },
      onState: (state) => {
        connectionState = state;
        if (leaseHeld && state === "subscribed") pushHealth("running");
        if (
          leaseHeld && (state === "disconnected" || state === "reconnecting")
        ) {
          pushHealth("degraded");
        }
      },
      onReconnect: () => {
        engine.incrementReconnect();
      },
      shouldRun: () => running && leaseHeld && !opts.signal.aborted,
    });
    socket.start();
  };

  const loop = async () => {
    let lastSnapshotMs = 0;
    let lastEvalMs = 0;
    let lastHeartbeatMs = 0;

    while (running && !opts.signal.aborted) {
      const wallNow = nowMs();
      try {
        if (!leaseHeld) {
          leaseHeld = await lease.tryAcquire(holderId, config.leaseTtlMs);
          if (!leaseHeld) {
            pushHealth("degraded");
            await sleep(config.leaseRenewMs);
            continue;
          }
          log("info", "radar_lease_acquired", {});
          lastHeartbeatMs = wallNow;
          try {
            const exceptions = await opts.loadExceptions();
            engine.setExceptions(exceptions);
          } catch {
            log("warn", "radar_calendar_load_failed", {
              code: "calendar_unavailable",
            });
          }
          startSocket();
        }

        if (wallNow - lastHeartbeatMs >= config.leaseRenewMs) {
          const ok = await lease.heartbeat(holderId, config.leaseTtlMs);
          lastHeartbeatMs = wallNow;
          if (!ok) {
            leaseHeld = false;
            socket?.stop();
            connectionState = "idle";
            pushHealth("degraded");
            log("warn", "radar_lease_lost", {});
            continue;
          }
        }

        if (
          wallNow - lastSnapshotMs >= config.snapshotRefreshMs ||
          lastSnapshotMs === 0
        ) {
          try {
            const universe = await refreshEligibleUniverse({
              apiKey: opts.env.polygonApiKey,
              fetch: opts.fetch,
              config,
              sleep,
            });
            engine.setUniverse(universe);
            lastSnapshotMs = wallNow;
            log("info", "radar_universe_refreshed", { size: universe.size });
          } catch {
            log("error", "radar_snapshot_failed", {
              code: "provider_unavailable",
            });
            if (lastSnapshotMs === 0) lastSnapshotMs = wallNow;
          }
        }

        if (wallNow - lastEvalMs >= config.evaluationIntervalMs) {
          await evaluateAndPublish();
          lastEvalMs = wallNow;
        }
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "internal_error";
        log("error", "radar_loop_failed", { code });
        pushHealth("degraded");
      }
      await sleep(250);
    }

    socket?.stop();
    if (leaseHeld) {
      await lease.release(holderId);
      leaseHeld = false;
    }
    pushHealth("degraded");
  };

  const runningLoop = loop();

  return {
    async stop() {
      running = false;
      socket?.stop();
      if (leaseHeld) {
        await lease.release(holderId);
        leaseHeld = false;
      }
      await runningLoop;
    },
  };
}
