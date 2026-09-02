import type { CalendarExceptionLoader } from "../baseline/persist.ts";
import type { FetchLike } from "../baseline/grouped.ts";
import type { WorkerEnv } from "../env.ts";
import { log } from "../log.ts";
import { isoFromMs } from "./time.ts";
import { mergeRadarConfig, type RadarV22Config } from "./config.ts";
import { createRadarEngine, persistableGeneration } from "./engine.ts";
import { createRadarBridge } from "../bridge.ts";
import { type LeaseClient } from "./lease.ts";
import {
  publishRadarGeneration,
  type RadarRpcFn,
  type SetStatusFn,
} from "./persist.ts";
import {
  createRadarV2WriteGate,
  publishRadarV2IfNeeded,
  type RadarV2RpcFn,
} from "./persist_v2.ts";
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
  rpcV2?: RadarV2RpcFn;
  setStatus?: SetStatusFn;
  holderId?: string;
}): RadarRuntime {
  const config = mergeRadarConfig({
    sentinelEnabled: opts.env.radarSentinelEnabled,
    ...opts.config,
  });
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
  const rpcV2 = opts.rpcV2 ?? bridged.radarV2Rpc;
  const setStatus = opts.setStatus ?? bridged.setStatus;
  const holderId = opts.holderId ?? `radar-${crypto.randomUUID()}`;
  const engine = createRadarEngine({ config, exceptions: [] });
  let leaseHeld = false;
  let connectionState: RadarConnectionState = "idle";
  let lastPublishedGeneration: string | null = null;
  const v2Gate = createRadarV2WriteGate();
  let running = true;
  let socket: ReturnType<typeof createRadarSocket> | null = null;

  function healthSnapshot(
    status: RadarHealthSnapshot["status"],
  ): RadarHealthSnapshot {
    const counters = engine.counters();
    const board = engine.snapshot();
    const eventMs = engine.eventNowMs();
    const sentinel = engine.sentinelStats();
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
      sentinel_enabled: sentinel.enabled,
      sentinel_live: sentinel.live,
      promoted_count: sentinel.promoted,
      promotion_cap: sentinel.cap,
      sentinel_evictions: sentinel.evictions,
      promotions_total: sentinel.promotionsTotal,
      demotions_total: sentinel.demotionsTotal,
      cap_rejections: sentinel.capRejections,
      rss_bytes: sentinel.rssBytes,
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
    const syncedAt = isoFromMs(wallNow) ?? new Date(wallNow).toISOString();
    if (result.staleTransition) {
      await setStatus({
        p_status: result.board.rows.length > 0 ? "stale" : "empty",
        p_last_provider_event_at: result.board.lastProviderEventAt,
        p_synced_at: syncedAt,
      });
      pushHealth("stale");
      const v2 = await publishRadarV2IfNeeded({
        flagEnabled: opts.env.radarPersistenceV2Enabled,
        result,
        gate: v2Gate,
        wallNowMs: wallNow,
        checkpointMs: opts.env.radarPersistenceV2CheckpointMs,
        generationId,
        syncedAt,
        rpc: rpcV2,
      });
      if (v2 !== "skipped" && !v2.ok) {
        log("error", "radar_persist_v2_failed", { code: v2.code });
      }
      return;
    }
    if (result.published) {
      const persist = persistableGeneration(result);
      const published = await publishRadarGeneration(rpc, {
        p_generation_id: generationId,
        p_rows: persist.rows.map((row) => ({
          ...row,
          generation_id: generationId,
          updated_at: syncedAt,
        })),
        p_archive: persist.archives.map((row) => ({
          ...row,
          generation_id: generationId,
          archived_at: syncedAt,
        })),
        p_session_date: persist.sessionDate,
        p_synced_at: syncedAt,
        p_status: persist.status,
        p_last_provider_event_at: result.board.lastProviderEventAt,
      });
      if (published.ok) {
        lastPublishedGeneration = generationId;
      } else {
        log("error", "radar_persist_failed", { code: published.code });
      }
    }

    const v2 = await publishRadarV2IfNeeded({
      flagEnabled: opts.env.radarPersistenceV2Enabled,
      result,
      gate: v2Gate,
      wallNowMs: wallNow,
      checkpointMs: opts.env.radarPersistenceV2CheckpointMs,
      generationId,
      syncedAt,
      rpc: rpcV2,
    });
    if (v2 !== "skipped" && !v2.ok) {
      log("error", "radar_persist_v2_failed", { code: v2.code });
    }

    if (!result.published && !opts.env.radarPersistenceV2Enabled) {
      pushHealth(leaseHeld ? "running" : "degraded");
      return;
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
            const sentinel = engine.sentinelStats();
            log("info", "radar_universe_refreshed", {
              size: universe.size,
              sentinel_enabled: sentinel.enabled,
              sentinel_live: sentinel.live,
              promoted_count: sentinel.promoted,
              promotion_cap: sentinel.cap,
            });
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
