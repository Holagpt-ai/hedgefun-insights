import type { ScreenerUiStatus } from "@/lib/screeners/contract";
import { MarketDataStatus } from "@/components/screener/MarketDataStatus";
import type { MarketFeedTelemetry } from "@/lib/market-feed/telemetry";
import type { RadarEngineSource } from "./types";

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

/** @deprecated Use MarketDataStatus — kept for tests comparing stable timestamp formatting. */
export function formatHealthyRadarFeedLine(
  providerAsOfMax: string | null,
  syncedAt: string | null,
): string {
  const parts: string[] = ["Market data status"];
  if (providerAsOfMax) parts.push("last data timestamp available");
  if (syncedAt) parts.push("received timestamp available");
  return parts.join(" · ");
}

interface RadarStatusRailProps {
  status: ScreenerUiStatus;
  qualifyingCount: number;
  syncedAt: string | null;
  providerAsOfMax: string | null;
  marketFeed?: MarketFeedTelemetry | null;
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
  marketFeed = null,
}: RadarStatusRailProps) {
  const abnormal =
    status === "stale" ||
    status === "unavailable" ||
    status === "loading" ||
    status === "empty";

  const suffix =
    qualifyingCount > 0 && (status === "available" || status === "stale")
      ? `${qualifyingCount} Radar candidates`
      : null;

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
        <div className="mt-1.5" data-testid="radar-feed-line">
          <MarketDataStatus
            status={status}
            syncedAt={syncedAt}
            providerAsOfMax={providerAsOfMax}
            marketFeed={marketFeed}
            suffix={suffix}
          />
        </div>
      </div>
    );
  }

  return (
    <div data-testid="radar-status-rail">
      <div data-testid="radar-feed-line">
        <MarketDataStatus
          status={status}
          syncedAt={syncedAt}
          providerAsOfMax={providerAsOfMax}
          marketFeed={marketFeed}
          suffix={suffix}
        />
      </div>
    </div>
  );
}
