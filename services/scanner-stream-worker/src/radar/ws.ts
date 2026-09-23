import { log } from "../log.ts";
import type { RadarV22Config } from "./config.ts";
import {
  authMessage,
  reconnectDelayMs,
  subscribeMessage,
  wsUrlForMassiveEndpoint,
  type MassiveWsEndpoint,
} from "./parse.ts";
import type { RadarConnectionState } from "./types.ts";
import {
  massiveEndpointForFeedMode,
  type MarketDataFeedMode,
} from "../../../../supabase/functions/_shared/market-feed/config.ts";

export type RadarWsHandlers = {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onClose: () => void;
  onError: () => void;
};

export type RadarWsHandle = {
  send: (data: string) => void;
  close: () => void;
};

export type RadarWsConnect = (
  url: string,
  handlers: RadarWsHandlers,
) => RadarWsHandle;

export const defaultWsConnect: RadarWsConnect = (url, handlers) => {
  const socket = new WebSocket(url);
  socket.addEventListener("open", () => handlers.onOpen());
  socket.addEventListener("message", (ev) => {
    const data = typeof ev.data === "string" ? ev.data : "";
    handlers.onMessage(data);
  });
  socket.addEventListener("close", () => handlers.onClose());
  socket.addEventListener("error", () => handlers.onError());
  return {
    send: (data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data);
    },
    close: () => {
      try {
        socket.close();
      } catch {
        // already closed
      }
    },
  };
};

export type RadarSocketController = {
  start: () => void;
  stop: () => void;
  connectionState: () => RadarConnectionState;
  activeEndpoint: () => MassiveWsEndpoint;
};

export function createRadarSocket(opts: {
  feedMode: MarketDataFeedMode;
  apiKey: string;
  config: RadarV22Config;
  connect?: RadarWsConnect;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  nowMs?: () => number;
  onEvent: (raw: unknown, receiveMs: number) => void;
  onState: (state: RadarConnectionState) => void;
  onEndpointChange?: (endpoint: MassiveWsEndpoint) => void;
  onReconnect: () => void;
  shouldRun: () => boolean;
}): RadarSocketController {
  const connect = opts.connect ?? defaultWsConnect;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  const nowMs = opts.nowMs ?? (() => Date.now());
  let state: RadarConnectionState = "idle";
  let handle: RadarWsHandle | null = null;
  let stopped = false;
  let attempt = 0;
  let loop: Promise<void> | null = null;
  let activeEndpoint: MassiveWsEndpoint = massiveEndpointForFeedMode(
    opts.feedMode,
  );
  let authFailedOnRealtime = false;

  function setState(next: RadarConnectionState) {
    state = next;
    opts.onState(next);
  }

  function setEndpoint(next: MassiveWsEndpoint): void {
    if (activeEndpoint === next) return;
    activeEndpoint = next;
    opts.onEndpointChange?.(next);
  }

  function dispatchPayload(data: string, receiveMs: number): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (item === null || typeof item !== "object") continue;
      const ev = (item as { ev?: unknown }).ev;
      if (ev === "A") opts.onEvent(item, receiveMs);
      if (ev === "status") {
        const status = String((item as { status?: unknown }).status ?? "");
        if (status === "auth_success") {
          handle?.send(subscribeMessage());
          setState("subscribed");
        } else if (
          status === "auth_failed" || status === "auth_timeout" ||
          status === "unauthorized"
        ) {
          if (
            activeEndpoint === "realtime" &&
            (opts.feedMode === "auto" || opts.feedMode === "realtime")
          ) {
            authFailedOnRealtime = true;
            log("warn", "radar_ws_auth_failed_realtime", {
              feed_mode: opts.feedMode,
              status,
            });
            handle?.close();
          }
        }
      }
    }
  }

  function resolveEndpoint(): MassiveWsEndpoint {
    if (opts.feedMode === "delayed") return "delayed";
    if (authFailedOnRealtime && opts.feedMode === "auto") return "delayed";
    return massiveEndpointForFeedMode(opts.feedMode);
  }

  async function run(): Promise<void> {
    while (!stopped && opts.shouldRun()) {
      setEndpoint(resolveEndpoint());
      setState(attempt === 0 ? "connecting" : "reconnecting");
      const url = wsUrlForMassiveEndpoint(activeEndpoint);
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        handle = connect(url, {
          onOpen: () => {
            setState("authenticating");
            handle?.send(authMessage(opts.apiKey));
            log("info", "radar_ws_auth_sent", {
              feed_mode: opts.feedMode,
              endpoint: activeEndpoint,
            });
          },
          onMessage: (data) => {
            dispatchPayload(data, nowMs());
          },
          onClose: () => {
            setState("disconnected");
            finish();
          },
          onError: () => {
            setState("disconnected");
            finish();
          },
        });
      });
      handle = null;
      if (stopped || !opts.shouldRun()) break;
      attempt += 1;
      opts.onReconnect();
      const delay = reconnectDelayMs(attempt, opts.config, random);
      log("warn", "radar_ws_reconnect", {
        attempt,
        delay_ms: delay,
        endpoint: activeEndpoint,
      });
      await sleep(delay);
    }
    setState("idle");
  }

  return {
    start() {
      if (loop) return;
      stopped = false;
      attempt = 0;
      authFailedOnRealtime = false;
      loop = run();
    },
    stop() {
      stopped = true;
      handle?.close();
      handle = null;
    },
    connectionState() {
      return state;
    },
    activeEndpoint() {
      return activeEndpoint;
    },
  };
}
