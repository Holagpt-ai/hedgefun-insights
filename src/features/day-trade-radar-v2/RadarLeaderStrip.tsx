import { useCatalystEnrichmentForSymbols } from "@/hooks/useCatalystEnrichmentForSymbols";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  formatHodDistance,
  formatRadarMultiplier,
  formatRadarPercent,
  formatRadarPrice,
  formatRadarVolume,
  isRadarRowAccessible,
  moveClass,
  radarSignalClass,
  volumeRatioClass,
} from "./radar-metrics";
import type { RadarRankedRow } from "./types";

interface RadarLeaderStripProps {
  row: RadarRankedRow | null;
  followingLeader: boolean;
  showReturnToLeader: boolean;
  isPro: boolean;
  freeRowLimit: number;
  onFollowLeader: () => void;
  onReturnToLeader: () => void;
  onOpenDetails: () => void;
}

export function RadarLeaderStrip({
  row,
  followingLeader,
  showReturnToLeader,
  isPro,
  freeRowLimit,
  onFollowLeader,
  onReturnToLeader,
  onOpenDetails,
}: RadarLeaderStripProps) {
  const accessible = row ? isRadarRowAccessible(row.access_rank ?? row.rank, isPro, freeRowLimit) : false;
  const symbols = accessible && row ? ([normalizeSymbol(row.symbol)].filter(Boolean) as string[]) : [];
  const { data: catalystMap, isPending, isFetching, isError } = useCatalystEnrichmentForSymbols(symbols);
  const catalystPending = symbols.length > 0 && (isPending || (isFetching && !catalystMap));
  const entry = row ? catalystMap?.get(row.symbol) : undefined;

  if (!row) return null;

  const catalystLabel = !accessible
    ? null
    : catalystPending
      ? "Catalyst pending"
      : isError
        ? "Catalyst unavailable"
        : entry
          ? "Catalyst"
          : "No Catalyst";

  return (
    <div
      data-testid="radar-leader-strip"
      className="flex h-[64px] items-center gap-2 overflow-x-auto rounded-lg border border-border bg-card px-3 text-[12px] whitespace-nowrap"
    >
      <span className="font-semibold tabular-nums text-muted-foreground">#{row.rank}</span>
      <span className="font-semibold tracking-wide text-accent-blue">{row.symbol}</span>
      <span className={`text-[10px] font-semibold uppercase tracking-wide ${radarSignalClass(row.signal)}`}>
        {row.signal}
      </span>
      <span className="tabular-nums">{formatRadarPrice(row.price)}</span>
      <span className={`tabular-nums ${moveClass(row.change_percent)}`}>
        {formatRadarPercent(row.change_percent)}
      </span>
      <span className="text-muted-foreground">
        Vol <span className="tabular-nums text-foreground">{formatRadarVolume(row.volume)}</span>
      </span>
      <span className={volumeRatioClass(row.volume_ratio_prior_session)}>
        {formatRadarMultiplier(row.volume_ratio_prior_session)} Prior
      </span>
      <span className="text-muted-foreground">
        {formatHodDistance(row.hod_distance_percent)} from HOD
      </span>
      {catalystLabel && <span className="text-muted-foreground">{catalystLabel}</span>}
      <button
        type="button"
        onClick={onFollowLeader}
        className={`ml-auto h-8 shrink-0 rounded-md px-2.5 text-[12px] font-semibold ${
          followingLeader
            ? "bg-accent-blue text-white"
            : "border border-border text-foreground hover:bg-muted"
        }`}
      >
        Follow #1{followingLeader ? " ✓" : ""}
      </button>
      {showReturnToLeader && (
        <button
          type="button"
          onClick={onReturnToLeader}
          className="h-8 shrink-0 rounded-md border border-border px-2.5 text-[12px] font-semibold hover:bg-muted"
        >
          Return to #1
        </button>
      )}
      {accessible && (
        <button
          type="button"
          onClick={onOpenDetails}
          className="h-8 shrink-0 rounded-md border border-border px-2.5 text-[12px] font-semibold hover:bg-muted"
        >
          Details
        </button>
      )}
    </div>
  );
}
