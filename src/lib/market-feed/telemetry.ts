/**
 * Client mirror of supabase/functions/_shared/market-feed/telemetry.ts
 */

export type MarketDataFeedMode =
  | "realtime"
  | "streaming"
  | "near_realtime"
  | "delayed"
  | "auto";

export type MarketFeedConnectionState =
  | "idle"
  | "connecting"
  | "authenticating"
  | "subscribed"
  | "reconnecting"
  | "disconnected";

export type MarketFeedTelemetry = {
  provider: string;
  feed_mode: MarketDataFeedMode | string;
  market_timestamp: string | null;
  received_at: string | null;
  latency_ms: number | null;
  connection_state: MarketFeedConnectionState | string;
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

export type MarketFeedDisplayTier =
  | "streaming"
  | "near_realtime"
  | "delayed"
  | "stale"
  | "connecting"
  | "unknown";

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
  if (conn === "disconnected" || conn === "idle") return "stale";
  if (telemetry.feed_mode === "delayed") return "delayed";
  const latency = telemetry.latency_ms;
  if (latency !== null && latency !== undefined) {
    if (latency >= 5 * 60_000) return "delayed";
    if (latency >= 15_000) return "near_realtime";
    if (latency <= 10_000) return "streaming";
  }
  if (telemetry.feed_mode === "near_realtime") return "near_realtime";
  if (telemetry.feed_mode === "realtime" || telemetry.feed_mode === "streaming") {
    return "streaming";
  }
  if (telemetry.feed_mode === "auto") {
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

export function formatSubSecondAge(iso: string | null, nowMs: number): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const diffMs = nowMs - then;
  if (diffMs < 0) return "just now";
  if (diffMs < 1_000) return "<1s ago";
  const secs = Math.floor(diffMs / 1_000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}
