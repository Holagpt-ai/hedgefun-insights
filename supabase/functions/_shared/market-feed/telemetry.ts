/**
 * Feed latency / health contract (Scanner Phase 3).
 * Pure helpers — safe in worker, bridge tests, and UI mirrors.
 */

import type { MarketDataFeedMode, MarketDataProvider } from "./config.ts";

export const MARKET_FEED_CONNECTION_STATES = [
  "idle",
  "connecting",
  "authenticating",
  "subscribed",
  "reconnecting",
  "disconnected",
] as const;
export type MarketFeedConnectionState =
  (typeof MARKET_FEED_CONNECTION_STATES)[number];

export type MarketFeedTelemetry = {
  provider: MarketDataProvider;
  feed_mode: MarketDataFeedMode;
  /** Provider event time (bar end / market clock). */
  market_timestamp: string | null;
  /** Wall time when the worker received the last market message. */
  received_at: string | null;
  /** received_at - market_timestamp in ms, when both known. */
  latency_ms: number | null;
  connection_state: MarketFeedConnectionState;
  last_message_at: string | null;
  stale: boolean;
};

export function computeLatencyMs(
  marketTimestampMs: number | null,
  receivedAtMs: number | null,
): number | null {
  if (
    marketTimestampMs === null || receivedAtMs === null ||
    !Number.isFinite(marketTimestampMs) || !Number.isFinite(receivedAtMs)
  ) {
    return null;
  }
  const delta = receivedAtMs - marketTimestampMs;
  if (!Number.isFinite(delta) || delta < 0) return null;
  return Math.trunc(delta);
}

/** Ingest liveness: no messages within this window during an active socket ⇒ stale. */
export const DEFAULT_FEED_MESSAGE_STALE_MS = 120_000;

export function isFeedMessageStale(
  lastMessageAtMs: number | null,
  nowMs: number,
  thresholdMs = DEFAULT_FEED_MESSAGE_STALE_MS,
): boolean {
  if (lastMessageAtMs === null) return true;
  return nowMs - lastMessageAtMs > thresholdMs;
}

export type MarketFeedDisplayTier =
  | "streaming"
  | "near_realtime"
  | "delayed"
  | "stale"
  | "connecting"
  | "unknown";

/** UI tier — does not claim LIVE without telemetry evidence. */
export function deriveMarketFeedDisplayTier(
  telemetry: Partial<MarketFeedTelemetry> | null,
  nowMs: number,
): MarketFeedDisplayTier {
  if (!telemetry) return "unknown";
  if (telemetry.stale === true) return "stale";
  const conn = telemetry.connection_state;
  if (
    conn === "connecting" || conn === "authenticating" ||
    conn === "reconnecting"
  ) {
    return "connecting";
  }
  if (conn === "disconnected" || conn === "idle") {
    return "stale";
  }
  const mode = telemetry.feed_mode;
  if (mode === "delayed") return "delayed";
  const latency = telemetry.latency_ms;
  if (latency !== null && latency !== undefined) {
    if (latency >= 5 * 60_000) return "delayed";
    if (latency >= 15_000) return "near_realtime";
    if (latency <= 10_000) return "streaming";
  }
  if (mode === "near_realtime") return "near_realtime";
  if (mode === "realtime" || mode === "streaming") return "streaming";
  if (mode === "auto") {
    const lastMs = telemetry.last_message_at
      ? Date.parse(telemetry.last_message_at)
      : null;
    if (lastMs !== null && nowMs - lastMs <= 5_000) return "streaming";
  }
  return "near_realtime";
}

export function marketFeedDisplayLabel(tier: MarketFeedDisplayTier): string {
  switch (tier) {
    case "streaming":
      return "Streaming";
    case "near_realtime":
      return "Near real-time";
    case "delayed":
      return "Delayed";
    case "stale":
      return "Stale";
    case "connecting":
      return "Connecting";
    default:
      return "Market data status";
  }
}
