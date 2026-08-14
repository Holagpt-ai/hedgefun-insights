import type { ScreenerUiStatus } from "@/lib/screeners/contract";
import { parseTimestampMs } from "@/lib/screeners/contract";

function formatPipelineAge(iso: string | null): string | null {
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

function formatProviderAsOf(iso: string | null): string | null {
  if (!iso) return null;
  const ms = parseTimestampMs(iso);
  if (ms === null) return null;
  return new Date(ms).toLocaleString();
}

const ENGINE_CHIPS = [
  "AUTO RADAR ON",
  "$2–$20 ENTRY",
  "+10% CONFIRMED",
  "CURRENT VOL ≥5× PRIOR",
  "VOLUME FIRST",
] as const;

interface RadarStatusRailProps {
  status: ScreenerUiStatus;
  qualifyingCount: number;
  syncedAt: string | null;
  providerAsOfMax: string | null;
  followingLeader: boolean;
  onFollowLeader: () => void;
  showReturnToLeader: boolean;
  onReturnToLeader: () => void;
  engineSource?: "v2.1" | "v2.2";
}

export function RadarStatusRail({
  status,
  qualifyingCount,
  syncedAt,
  providerAsOfMax,
  followingLeader,
  onFollowLeader,
  showReturnToLeader,
  onReturnToLeader,
  engineSource = "v2.1",
}: RadarStatusRailProps) {
  const providerLabel = formatProviderAsOf(providerAsOfMax);
  const pipelineAge = formatPipelineAge(syncedAt);
  const statusLabel =
    status === "available"
      ? "Available"
      : status === "stale"
        ? "Stale"
        : status === "empty"
          ? "Empty"
          : status === "loading"
            ? "Loading"
            : "Unavailable";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded border border-border px-2 py-0.5 font-semibold uppercase tracking-wide text-muted-foreground">
          {engineSource === "v2.2" ? "Radar V2.2" : "Radar V2.1 snapshot"}
        </span>
        <span className="rounded border border-border px-2 py-0.5 font-semibold uppercase tracking-wide text-muted-foreground">
          Feed: 15-Minute Delayed
        </span>
        <span
          className={`rounded border px-2 py-0.5 font-semibold uppercase tracking-wide ${
            status === "stale"
              ? "border-amber-500/40 text-amber-700 dark:text-amber-400"
              : status === "unavailable"
                ? "border-border text-muted-foreground"
                : "border-border text-foreground"
          }`}
        >
          Status: {statusLabel}
        </span>
        <span className="rounded border border-border px-2 py-0.5 tabular-nums text-muted-foreground">
          Qualifying: {qualifyingCount}
        </span>
        {providerLabel && (
          <span className="rounded border border-border px-2 py-0.5 text-muted-foreground">
            Provider: {providerLabel}
          </span>
        )}
        {pipelineAge && (
          <span className="rounded border border-border px-2 py-0.5 text-muted-foreground">
            Pipeline: {pipelineAge}
          </span>
        )}
        <span className="rounded border border-border px-2 py-0.5 font-semibold text-foreground">
          {followingLeader ? "Follow #1: On" : "Follow #1: Off"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {ENGINE_CHIPS.map((chip) => (
          <span
            key={chip}
            className="rounded bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onFollowLeader}
          className={`h-8 rounded-md px-3 text-[12px] font-semibold transition-colors ${
            followingLeader
              ? "bg-accent-blue text-white"
              : "border border-border text-foreground hover:bg-muted"
          }`}
        >
          Follow #1
        </button>
        {showReturnToLeader && (
          <button
            type="button"
            onClick={onReturnToLeader}
            className="h-8 rounded-md border border-border px-3 text-[12px] font-semibold text-foreground hover:bg-muted transition-colors"
          >
            Return to #1
          </button>
        )}
      </div>
    </div>
  );
}
