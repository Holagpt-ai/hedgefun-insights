import type { ScreenerUiStatus } from "@/lib/screeners/contract";
import { parseTimestampMs } from "@/lib/screeners/contract";

export function formatMarketDataAge(iso: string | null): string | null {
  if (!iso) return null;
  const then = parseTimestampMs(iso);
  if (then === null) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
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

function statusTone(status: ScreenerUiStatus): string {
  if (status === "available") return "text-emerald-600";
  if (status === "stale") return "text-amber-600";
  if (status === "loading") return "text-muted-foreground";
  return "text-muted-foreground";
}

function statusLabel(status: ScreenerUiStatus): string {
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
  /** Optional suffix (e.g. candidate count on Radar). */
  suffix?: string | null;
  className?: string;
}

export function MarketDataStatus({
  status,
  syncedAt = null,
  providerAsOfMax = null,
  suffix = null,
  className = "",
}: MarketDataStatusProps) {
  const dataTs = formatMarketDataTimestamp(providerAsOfMax);
  const received = formatMarketDataAge(syncedAt);
  const tone = statusTone(status);

  return (
    <div
      data-testid="market-data-status"
      className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground ${className}`}
    >
      <span className="font-medium text-foreground">Data Status</span>
      <span className={`inline-flex items-center gap-1 ${tone}`} aria-hidden>
        <span>●</span>
      </span>
      <span>{statusLabel(status)}</span>
      {dataTs ? <span>· Last data {dataTs}</span> : null}
      {received ? <span>· Received {received}</span> : null}
      {suffix ? <span className="tabular-nums">· {suffix}</span> : null}
    </div>
  );
}
