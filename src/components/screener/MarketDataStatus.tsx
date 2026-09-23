import type { ScreenerUiStatus } from "@/lib/screeners/contract";
import { parseTimestampMs } from "@/lib/screeners/contract";
import type { MarketFeedTelemetry } from "@/lib/market-feed/telemetry";
import {
  deriveMarketFeedDisplayTier,
  formatSubSecondAge,
  marketFeedDisplayLabel,
} from "@/lib/market-feed/telemetry";

export function formatMarketDataAge(iso: string | null): string | null {
  if (!iso) return null;
  const then = parseTimestampMs(iso);
  if (then === null) return null;
  return formatSubSecondAge(iso, Date.now());
}

export function formatMarketDataTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const ms = parseTimestampMs(iso);
  if (ms === null) return null;
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(
  status: ScreenerUiStatus,
  tier: ReturnType<typeof deriveMarketFeedDisplayTier>,
): string {
  if (tier === "streaming") return "text-emerald-600";
  if (tier === "near_realtime") return "text-emerald-600";
  if (tier === "delayed") return "text-muted-foreground";
  if (tier === "stale" || status === "stale") return "text-amber-600";
  if (status === "loading") return "text-muted-foreground";
  return "text-muted-foreground";
}

function legacyStatusLabel(status: ScreenerUiStatus): string {
  if (status === "available") return "Market data status";
  if (status === "stale") return "Delayed snapshot";
  if (status === "loading") return "Loading market data";
  if (status === "unavailable") return "Market data unavailable";
  if (status === "initializing") return "Market data initializing";
  return "Market data status";
}

interface MarketDataStatusProps {
  status: ScreenerUiStatus;
  syncedAt?: string | null;
  providerAsOfMax?: string | null;
  marketFeed?: MarketFeedTelemetry | null;
  /** Optional suffix (e.g. candidate count on Radar). */
  suffix?: string | null;
  className?: string;
}

export function MarketDataStatus({
  status,
  syncedAt = null,
  providerAsOfMax = null,
  marketFeed = null,
  suffix = null,
  className = "",
}: MarketDataStatusProps) {
  const nowMs = Date.now();
  const tier = marketFeed
    ? deriveMarketFeedDisplayTier(marketFeed, nowMs)
    : null;
  const label = tier ? marketFeedDisplayLabel(tier) : legacyStatusLabel(status);
  const updateIso = marketFeed?.last_message_at ?? syncedAt;
  const updated = formatSubSecondAge(updateIso, nowMs) ??
    formatMarketDataAge(syncedAt);
  const marketTs = formatMarketDataTimestamp(
    marketFeed?.market_timestamp ?? providerAsOfMax,
  );
  const lagMs = marketFeed?.latency_ms;
  const lagLabel = lagMs != null && lagMs >= 60_000
    ? `Market lag ${Math.round(lagMs / 60_000)}m`
    : lagMs != null && lagMs >= 1_000
    ? `Market lag ${Math.round(lagMs / 1_000)}s`
    : null;
  const tone = statusTone(status, tier ?? "unknown");

  return (
    <div
      data-testid="market-data-status"
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground ${className}`}
    >
      <span className="font-medium text-foreground">Data Status</span>
      <span className={`inline-flex items-center gap-1 ${tone}`} aria-hidden>
        <span>●</span>
      </span>
      <span>{label}</span>
      {updated ? <span>· Updated {updated}</span> : null}
      {marketTs ? <span>· Last data {marketTs}</span> : null}
      {lagLabel ? <span>· {lagLabel}</span> : null}
      {suffix ? <span className="tabular-nums">· {suffix}</span> : null}
    </div>
  );
}
