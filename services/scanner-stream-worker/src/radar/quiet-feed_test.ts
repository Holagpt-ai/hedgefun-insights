import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { CalendarExceptionRow } from "../../../../supabase/functions/_shared/markets/session-schedule.ts";
import { mergeRadarConfig } from "./config.ts";
import {
  createRadarSocket,
  DEFAULT_CLOSED_SESSION_RECONNECT_MS,
  DEFAULT_SILENT_MARKET_MS,
  type RadarWsHandle,
} from "./ws.ts";

const REALTIME = "wss://socket.massive.com/stocks";
const DELAYED = "wss://delayed.massive.com/stocks";
const MARKET = Date.parse("2026-08-10T14:00:00.000Z"); // Mon 10:00 ET
const OVERNIGHT = Date.parse("2026-08-11T06:00:00.000Z"); // Tue 02:00 ET
const NEXT_PREMARKET = Date.parse("2026-08-11T08:00:00.000Z"); // Tue 04:00 ET
const WEEKEND = Date.parse("2026-08-15T14:00:00.000Z"); // Sat 10:00 ET

const HOLIDAY: CalendarExceptionRow = {
  session_date: "2026-08-10",
  market_status: "closed",
  regular_open_et: "09:30:00",
  regular_close_et: "16:00:00",
  after_hours_end_et: "20:00:00",
  holiday_name: "Test Holiday",
};

function socketConfig() {
  return mergeRadarConfig({
    reconnectBaseDelayMs: 1,
    reconnectMaxDelayMs: 1,
    reconnectJitter: 0,
  });
}

function connectRecording(
  urls: string[],
  opts?: { aggregateOnRealtimeAfter?: number },
): (url: string, handlers: {
  onOpen: () => void;
  onMessage: (data: string) => void;
  onClose: () => void;
}) => RadarWsHandle {
  return (url, handlers) => {
    urls.push(url);
    const handle: RadarWsHandle = {
      send: (data) => {
        const parsed = JSON.parse(data) as { action?: string };
        if (parsed.action !== "auth") return;
        handlers.onMessage(JSON.stringify({ ev: "status", status: "auth_success" }));
        const realtimeCount = urls.filter((u) => u === REALTIME).length;
        if (
          url === REALTIME &&
          opts?.aggregateOnRealtimeAfter !== undefined &&
          realtimeCount >= opts.aggregateOnRealtimeAfter
        ) {
          handlers.onMessage(JSON.stringify({
            ev: "A",
            sym: "AAPL",
            s: MARKET,
            e: MARKET + 1000,
            o: 1,
            h: 1,
            l: 1,
            c: 1,
            v: 1,
            vw: 1,
          }));
        }
      },
      close: () => handlers.onClose(),
    };
    queueMicrotask(() => handlers.onOpen());
    return handle;
  };
}

Deno.test("active market + realtime silence falls back to delayed", async () => {
  const urls: string[] = [];
  const socket = createRadarSocket({
    feedMode: "auto",
    apiKey: "secret-key",
    config: socketConfig(),
    silentMarketMs: 15,
    realtimeProbeMs: 10_000,
    nowMs: () => MARKET,
    exceptions: () => [],
    sleep: () => Promise.resolve(),
    connect: connectRecording(urls),
    onEvent: () => {},
    onState: () => {},
    onReconnect: () => {},
    shouldRun: () => urls.length < 2,
  });
  socket.start();
  await new Promise((r) => setTimeout(r, 80));
  socket.stop();
  assertEquals(urls[0], REALTIME);
  assertEquals(urls[1], DELAYED);
});

Deno.test("closed session silence clears a prior delayed downgrade", async () => {
  const urls: string[] = [];
  let now = MARKET;
  const socket = createRadarSocket({
    feedMode: "auto",
    apiKey: "secret-key",
    config: socketConfig(),
    silentMarketMs: 15,
    realtimeProbeMs: 10_000,
    nowMs: () => now,
    exceptions: () => [],
    sleep: () => Promise.resolve(),
    connect: (url, handlers) => {
      if (urls.length >= 2) now = OVERNIGHT;
      return connectRecording(urls)(url, handlers);
    },
    onEvent: () => {},
    onState: () => {},
    onReconnect: () => {},
    shouldRun: () => urls.length < 4,
  });
  socket.start();
  await new Promise((r) => setTimeout(r, 200));
  socket.stop();
  assertEquals(urls[0], REALTIME);
  assertEquals(urls[1], DELAYED);
  assertEquals(urls[urls.length - 1], REALTIME);
  assertEquals(socket.activeEndpoint(), "realtime");
});

Deno.test("closed overnight silence does not downgrade auto mode", async () => {
  const urls: string[] = [];
  const socket = createRadarSocket({
    feedMode: "auto",
    apiKey: "secret-key",
    config: socketConfig(),
    silentMarketMs: 15,
    nowMs: () => OVERNIGHT,
    exceptions: () => [],
    sleep: () => Promise.resolve(),
    connect: connectRecording(urls),
    onEvent: () => {},
    onState: () => {},
    onReconnect: () => {},
    shouldRun: () => true,
  });
  socket.start();
  await new Promise((r) => setTimeout(r, 70));
  assertEquals(urls.every((u) => u === REALTIME), true);
  assertEquals(socket.activeEndpoint(), "realtime");
  socket.stop();
});

Deno.test("next pre-market retries realtime after a prior-session delayed fallback", async () => {
  const urls: string[] = [];
  let now = MARKET;
  const socket = createRadarSocket({
    feedMode: "auto",
    apiKey: "secret-key",
    config: socketConfig(),
    silentMarketMs: 15,
    realtimeProbeMs: 10_000,
    nowMs: () => now,
    exceptions: () => [],
    sleep: () => Promise.resolve(),
    connect: (url, handlers) => {
      const handle = connectRecording(urls)(url, handlers);
      if (url === DELAYED) now = NEXT_PREMARKET;
      return handle;
    },
    onEvent: () => {},
    onState: () => {},
    onReconnect: () => {},
    shouldRun: () => urls.length < 3,
  });
  socket.start();
  await new Promise((r) => setTimeout(r, 120));
  socket.stop();
  assertEquals(urls[0], REALTIME);
  assertEquals(urls[1], DELAYED);
  assertEquals(urls[2], REALTIME);
  assertEquals(socket.activeEndpoint(), "realtime");
});

Deno.test("weekend and holiday silence do not downgrade auto mode", async () => {
  for (const clock of [
    { now: WEEKEND, exceptions: [] as CalendarExceptionRow[] },
    { now: MARKET, exceptions: [HOLIDAY] },
  ]) {
    const urls: string[] = [];
    const socket = createRadarSocket({
      feedMode: "auto",
      apiKey: "secret-key",
      config: socketConfig(),
      silentMarketMs: 15,
      nowMs: () => clock.now,
      exceptions: () => clock.exceptions,
      sleep: () => Promise.resolve(),
      connect: connectRecording(urls),
      onEvent: () => {},
      onState: () => {},
      onReconnect: () => {},
      shouldRun: () => true,
    });
    socket.start();
    await new Promise((r) => setTimeout(r, 70));
    assertEquals(urls.every((u) => u === REALTIME), true);
    assertEquals(socket.activeEndpoint(), "realtime");
    socket.stop();
  }
});

Deno.test("realtime recovery promotes auto mode back in the same session", async () => {
  const urls: string[] = [];
  const socket = createRadarSocket({
    feedMode: "auto",
    apiKey: "secret-key",
    config: socketConfig(),
    silentMarketMs: 15,
    realtimeProbeMs: 40,
    nowMs: () => MARKET,
    exceptions: () => [],
    sleep: () => Promise.resolve(),
    connect: connectRecording(urls, { aggregateOnRealtimeAfter: 2 }),
    onEvent: () => {},
    onState: () => {},
    onReconnect: () => {},
    shouldRun: () => urls.filter((u) => u === REALTIME).length < 2,
  });
  socket.start();
  await new Promise((r) => setTimeout(r, 200));
  socket.stop();
  assertEquals(urls[0], REALTIME);
  assertEquals(urls.includes(DELAYED), true);
  assertEquals(urls[urls.length - 1], REALTIME);
  assertEquals(socket.activeEndpoint(), "realtime");
});

Deno.test("production silent-market budget remains 20 seconds", () => {
  assertEquals(DEFAULT_SILENT_MARKET_MS, 20_000);
});

Deno.test("closed-session transport reconnects use the overnight backoff", async () => {
  const urls: string[] = [];
  const sleeps: number[] = [];
  const socket = createRadarSocket({
    feedMode: "auto",
    apiKey: "secret-key",
    config: socketConfig(),
    silentMarketMs: 15,
    nowMs: () => OVERNIGHT,
    exceptions: () => [],
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    connect: (url, handlers) => {
      const handle = connectRecording(urls)(url, handlers);
      queueMicrotask(() => handle.close());
      return handle;
    },
    onEvent: () => {},
    onState: () => {},
    onReconnect: () => {},
    shouldRun: () => sleeps.length < 1,
  });
  socket.start();
  await new Promise((r) => setTimeout(r, 50));
  socket.stop();
  assertEquals(urls.every((u) => u === REALTIME), true);
  assertEquals(sleeps[0], DEFAULT_CLOSED_SESSION_RECONNECT_MS);
});

Deno.test("delayed tape suppresses same-session realtime probe", async () => {
  const urls: string[] = [];
  const socket = createRadarSocket({
    feedMode: "auto",
    apiKey: "secret-key",
    config: socketConfig(),
    silentMarketMs: 15,
    realtimeProbeMs: 40,
    nowMs: () => MARKET,
    exceptions: () => [],
    sleep: () => Promise.resolve(),
    connect: (url, handlers) => {
      urls.push(url);
      const handle: RadarWsHandle = {
        send: (data) => {
          const parsed = JSON.parse(data) as { action?: string };
          if (parsed.action !== "auth") return;
          handlers.onMessage(JSON.stringify({ ev: "status", status: "auth_success" }));
          if (url === DELAYED) {
            handlers.onMessage(JSON.stringify({
              ev: "A",
              sym: "MSFT",
              s: MARKET,
              e: MARKET + 1000,
              o: 2,
              h: 2,
              l: 2,
              c: 2,
              v: 5,
              vw: 2,
            }));
          }
        },
        close: () => handlers.onClose(),
      };
      queueMicrotask(() => handlers.onOpen());
      return handle;
    },
    onEvent: () => {},
    onState: () => {},
    onReconnect: () => {},
    shouldRun: () => urls.length < 3,
  });
  socket.start();
  await new Promise((r) => setTimeout(r, 160));
  socket.stop();
  assertEquals(urls[0], REALTIME);
  assertEquals(urls[1], DELAYED);
  assertEquals(urls.filter((u) => u === REALTIME).length, 1);
  assertEquals(socket.activeEndpoint(), "delayed");
});

Deno.test("auth failure on realtime pins delayed fallback to the live session", async () => {
  const urls: string[] = [];
  const socket = createRadarSocket({
    feedMode: "auto",
    apiKey: "secret-key",
    config: socketConfig(),
    silentMarketMs: 10_000,
    realtimeProbeMs: 10_000,
    nowMs: () => MARKET,
    exceptions: () => [],
    sleep: () => Promise.resolve(),
    connect: (url, handlers) => {
      urls.push(url);
      const handle: RadarWsHandle = {
        send: (data) => {
          const parsed = JSON.parse(data) as { action?: string };
          if (parsed.action !== "auth") return;
          if (url === REALTIME) {
            handlers.onMessage(JSON.stringify({ ev: "status", status: "auth_failed" }));
            return;
          }
          handlers.onMessage(JSON.stringify({ ev: "status", status: "auth_success" }));
        },
        close: () => handlers.onClose(),
      };
      queueMicrotask(() => handlers.onOpen());
      return handle;
    },
    onEvent: () => {},
    onState: () => {},
    onReconnect: () => {},
    shouldRun: () => urls.length < 2,
  });
  socket.start();
  await new Promise((r) => setTimeout(r, 80));
  socket.stop();
  assertEquals(urls[0], REALTIME);
  assertEquals(urls[1], DELAYED);
});

Deno.test("delayed tape after fallback still reaches onEvent", async () => {
  const urls: string[] = [];
  const events: string[] = [];
  const socket = createRadarSocket({
    feedMode: "auto",
    apiKey: "secret-key",
    config: socketConfig(),
    silentMarketMs: 15,
    realtimeProbeMs: 10_000,
    nowMs: () => MARKET,
    exceptions: () => [],
    sleep: () => Promise.resolve(),
    connect: (url, handlers) => {
      urls.push(url);
      const handle: RadarWsHandle = {
        send: (data) => {
          const parsed = JSON.parse(data) as { action?: string };
          if (parsed.action !== "auth") return;
          handlers.onMessage(JSON.stringify({ ev: "status", status: "auth_success" }));
          if (url === DELAYED) {
            handlers.onMessage(JSON.stringify({
              ev: "A",
              sym: "MSFT",
              s: MARKET,
              e: MARKET + 1000,
              o: 2,
              h: 2,
              l: 2,
              c: 2,
              v: 5,
              vw: 2,
            }));
          }
        },
        close: () => handlers.onClose(),
      };
      queueMicrotask(() => handlers.onOpen());
      return handle;
    },
    onEvent: (raw) => {
      events.push(String((raw as { sym?: string }).sym ?? ""));
    },
    onState: () => {},
    onReconnect: () => {},
    shouldRun: () => urls.length < 2 || events.length < 1,
  });
  socket.start();
  await new Promise((r) => setTimeout(r, 80));
  socket.stop();
  assertEquals(urls[1], DELAYED);
  assertEquals(events.includes("MSFT"), true);
});
