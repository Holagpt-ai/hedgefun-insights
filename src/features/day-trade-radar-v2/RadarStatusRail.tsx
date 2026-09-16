import type { ScreenerUiStatus } from "@/lib/screeners/contract";
import { parseTimestampMs } from "@/lib/screeners/contract";
import type { RadarEngineSource } from "./types";

export function formatPipelineAge(iso: string | null): string | null {
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

export function formatProviderAsOf(iso: string | null): string | null {
  if (!iso) return null;
  const ms = parseTimestampMs(iso);
  if (ms === null) return null;
  return new Date(ms).toLocaleString();
}

/**
 * Legacy / RTH-snapshot engine chips. Kept for source-state honesty tests.
 * Not rendered in the healthy trader UI.
 */
export const LEGACY_ENGINE_CHIPS = [
  "AUTO RADAR ON",
  "$2–$20 ENTRY",
  "+10% CONFIRMED",
  "CURRENT VOL ≥5× PRIOR",
  "VOLUME FIRST",
] as const;

const RADAR_V2_SHARED_CHIPS = [
  "SENTINEL DISCOVERY",
  "VOLUME FIRST",
  "VELOCITY / ACCELERATION",
  "15-MIN DELAYED",
] as const;

/** Session chip for an accepted Radar V2 generation. Never inferred from clock. */
export function radarV2SessionChip(session: string | null | undefined): string | null {
  if (session === "pre-market") return "PRE-MARKET";
  if (session === "market") return "REGULAR MARKET";
  if (session === "after-hours") return "AFTER-HOURS";
  return null;
}

/**
 * Radar V2 candidate chips. Session comes from the accepted generation.
 * No $2–$20 / +10% / ≥5× / RVOL / gap claims.
 */
export function radarV2EngineChips(session: string | null | undefined): readonly string[] {
  const sessionChip = radarV2SessionChip(session);
  if (!sessionChip) return RADAR_V2_SHARED_CHIPS;
  return [
    "SENTINEL DISCOVERY",
    sessionChip,
    "VOLUME FIRST",
    "VELOCITY / ACCELERATION",
    "15-MIN DELAYED",
  ];
}

export function engineChipsFor(
  engineSource: RadarEngineSource,
  session?: string | null,
): readonly string[] {
  return engineSource === "radar-v2-candidates"
    ? radarV2EngineChips(session)
    : LEGACY_ENGINE_CHIPS;
}

export function engineLabelFor(engineSource: RadarEngineSource): string {
  if (engineSource === "radar-v2-candidates") return "Radar V2 Sentinel";
  if (engineSource === "v2.2") return "Radar V2.2";
  return "Radar V2.1 snapshot";
}

export function formatHealthyRadarFeedLine(
  providerAsOfMax: string | null,
  syncedAt: string | null,
): string {
  const data = formatProviderAsOf(providerAsOfMax);
  const age = formatPipelineAge(syncedAt);
  const parts = ["15-minute delayed"];
  if (data) parts.push(`Data as of ${data}`);
  if (age) parts.push(`Updated ${age}`);
  return parts.join(" · ");
}

interface RadarStatusRailProps {
  status: ScreenerUiStatus;
  qualifyingCount: number;
  syncedAt: string | null;
  providerAsOfMax: string | null;
  followingLeader?: boolean;
  onFollowLeader?: () => void;
  showReturnToLeader?: boolean;
  onReturnToLeader?: () => void;
  engineSource?: RadarEngineSource;
  session?: string | null;
}

export function RadarStatusRail({
  status,
  qualifyingCount,
  syncedAt,
  providerAsOfMax,
}: RadarStatusRailProps) {
  const feedLine = formatHealthyRadarFeedLine(providerAsOfMax, syncedAt);
  const abnormal =
    status === "stale" ||
    status === "unavailable" ||
    status === "loading" ||
    status === "empty";

  if (abnormal) {
    const title =
      status === "stale"
        ? "Feed stale"
        : status === "unavailable"
          ? "Data unavailable"
          : status === "loading"
            ? "Loading"
            : "Empty";
    const detail =
      status === "stale"
        ? "These rows are a delayed snapshot, not current market opportunities."
        : status === "unavailable"
          ? "Screener data is temporarily unavailable. No unverified rows are being shown."
          : status === "loading"
            ? "Loading the Radar candidate universe."
            : "No qualifying movers yet.";
    return (
      <div
        data-testid="radar-status-rail"
        className={`rounded-md border px-3 py-2 text-[13px] ${
          status === "stale"
            ? "border-amber-500/40 bg-amber-500/10 text-foreground"
            : "border-border bg-card text-foreground"
        }`}
      >
        <div className="font-semibold">{title}</div>
        <p className="mt-0.5 text-muted-foreground">{detail}</p>
        <div className="mt-1 text-[11px] text-muted-foreground" data-testid="radar-feed-line">
          {feedLine}
          {qualifyingCount > 0 ? ` · ${qualifyingCount} Radar candidates` : ""}
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="radar-status-rail"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
    >
      <span data-testid="radar-feed-line">{feedLine}</span>
      <span className="tabular-nums">{qualifyingCount} Radar candidates</span>
    </div>
  );
}
