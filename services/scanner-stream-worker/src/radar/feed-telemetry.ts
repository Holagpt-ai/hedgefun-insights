import type {
  MarketDataFeedMode,
  MarketDataProvider,
  MassiveWsEndpoint,
} from "../../../../supabase/functions/_shared/market-feed/config.ts";
import {
  computeLatencyMs,
  type MarketFeedConnectionState,
  type MarketFeedTelemetry,
  isFeedMessageStale,
} from "../../../../supabase/functions/_shared/market-feed/telemetry.ts";
import { isoFromMs } from "./time.ts";

export type FeedTelemetryTracker = {
  noteMarketMessage: (marketEndMs: number, receivedMs: number) => void;
  setConnectionState: (state: MarketFeedConnectionState) => void;
  setActiveEndpoint: (endpoint: MassiveWsEndpoint) => void;
  setEffectiveFeedMode: (mode: MarketDataFeedMode) => void;
  snapshot: (nowMs: number) => MarketFeedTelemetry;
};

export function createFeedTelemetryTracker(opts: {
  provider: MarketDataProvider;
  configuredFeedMode: MarketDataFeedMode;
  messageStaleMs?: number;
}): FeedTelemetryTracker {
  let connectionState: MarketFeedConnectionState = "idle";
  let activeEndpoint: MassiveWsEndpoint = "delayed";
  let effectiveFeedMode: MarketDataFeedMode = opts.configuredFeedMode;
  let lastMarketEndMs: number | null = null;
  let lastReceivedMs: number | null = null;
  let lastMessageMs: number | null = null;
  const staleMs = opts.messageStaleMs ?? 120_000;

  return {
    noteMarketMessage(marketEndMs, receivedMs) {
      lastMarketEndMs = marketEndMs;
      lastReceivedMs = receivedMs;
      lastMessageMs = receivedMs;
    },
    setConnectionState(state) {
      connectionState = state;
    },
    setActiveEndpoint(endpoint) {
      activeEndpoint = endpoint;
      if (endpoint === "delayed") {
        effectiveFeedMode = "delayed";
      } else if (opts.configuredFeedMode === "auto") {
        effectiveFeedMode = "realtime";
      }
    },
    setEffectiveFeedMode(mode) {
      effectiveFeedMode = mode;
    },
    snapshot(nowMs) {
      const latency = computeLatencyMs(lastMarketEndMs, lastReceivedMs);
      const staleByMessage = isFeedMessageStale(lastMessageMs, nowMs, staleMs);
      const staleByConn = connectionState === "disconnected" ||
        connectionState === "idle";
      return {
        provider: opts.provider,
        feed_mode: effectiveFeedMode,
        market_timestamp: lastMarketEndMs !== null
          ? isoFromMs(lastMarketEndMs)
          : null,
        received_at: lastReceivedMs !== null ? isoFromMs(lastReceivedMs) : null,
        latency_ms: latency,
        connection_state: connectionState,
        last_message_at: lastMessageMs !== null
          ? isoFromMs(lastMessageMs)
          : null,
        stale: staleByMessage || staleByConn,
      };
    },
  };
}
