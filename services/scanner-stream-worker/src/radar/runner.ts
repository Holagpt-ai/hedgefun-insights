import type { CalendarExceptionLoader } from "../baseline/persist.ts";
import type { FetchLike } from "../baseline/grouped.ts";
import type { WorkerEnv } from "../env.ts";
import { type RadarRuntime, startRadarV22 } from "./run.ts";
import type { RadarHealthSink } from "./run.ts";
import type { RadarV22Config } from "./config.ts";
import type { LeaseClient } from "./lease.ts";
import type { RadarRpcFn, SetStatusFn } from "./persist.ts";
import type { RadarWsConnect } from "./ws.ts";

export type RadarLoopDeps = {
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
};

/**
 * Production V2.2 radar loop. The worker process holds at most one lease
 * consumer via startRadarV22.
 */
export function runRadarLoop(deps: RadarLoopDeps): RadarRuntime {
  return startRadarV22(deps);
}

export type { RadarRuntime };
