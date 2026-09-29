import type { ScreenerUiStatus } from "@/lib/screeners/contract";
import { parseTimestampMs } from "@/lib/screeners/contract";
import type { MarketFeedTelemetry } from "@/lib/market-feed/telemetry";
import { formatSubSecondAge } from "@/lib/market-feed/telemetry";
import {
  formatMarketDataTrustLine,
  resolveScreenerMarketDataTrust,
  trustStateTone,
} from "@/lib/market-data/trust-states";

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

function loadingStatusLabel(status: ScreenerUiStatus): string | null {
  if (status === "loading") return "Loading market data";
  if (status === "initializing") return "Market data initializing";
  return null;
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
  const loadingLabel = loadingStatusLabel(status);
  const trust = resolveScreenerMarketDataTrust({
    status,
    syncedAt,
    providerAsOfMax,
    marketFeed,
    nowMs,
  });
  const sourceIso = marketFeed?.last_message_at ?? syncedAt ?? providerAsOfMax ?? null;
  const label = loadingLabel ??
    formatMarketDataTrustLine(trust, sourceIso, nowMs);
  const marketTs = formatMarketDataTimestamp(
    marketFeed?.market_timestamp ?? providerAsOfMax,
  );
  const lagMs = marketFeed?.latency_ms;
  const lagLabel = lagMs != null && lagMs >= 60_000
    ? `Market lag ${Math.round(lagMs / 60_000)}m`
    : lagMs != null && lagMs >= 1_000
    ? `Market lag ${Math.round(lagMs / 1_000)}s`
    : null;
  const tone = loadingLabel ? "text-muted-foreground" : trustStateTone(trust);

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
      {marketTs ? <span>· Last data {marketTs}</span> : null}
      {lagLabel ? <span>· {lagLabel}</span> : null}
      {suffix ? <span className="tabular-nums">· {suffix}</span> : null}
    </div>
  );
}
