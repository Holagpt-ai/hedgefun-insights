import { Link } from "react-router-dom";
import { Plus, Check, Loader2, Newspaper, Sparkles, BookOpen } from "lucide-react";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { useCatalystEnrichmentForSymbols } from "@/hooks/useCatalystEnrichmentForSymbols";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";
import { EVENT_TYPE_LABEL, normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  formatHodDistance,
  formatRadarMultiplier,
  formatRadarPercent,
  formatRadarPrice,
  formatRadarVolume,
  isRadarRowAccessible,
  moveClass,
  volumeRatioClass,
} from "./radar-metrics";
import type { RadarRankedRow } from "./types";

interface RadarMobileCardProps {
  row: RadarRankedRow;
  selected: boolean;
  isPro: boolean;
  freeRowLimit: number;
  onSelect: (row: RadarRankedRow) => void;
}

export function RadarMobileCard({
  row,
  selected,
  isPro,
  freeRowLimit,
  onSelect,
}: RadarMobileCardProps) {
  const accessible = isRadarRowAccessible(row.rank, isPro, freeRowLimit);
  const { add: addToWatchlist, isAdded, pendingSymbol } = useAddToWatchlist();
  const sym = row.symbol;
  const company = row.company_name?.trim() || sym;
  const already = isAdded(sym);
  const pending = pendingSymbol === sym;
  const symbols = accessible ? ([normalizeSymbol(sym)].filter(Boolean) as string[]) : [];
  const {
    data: catalystMap,
    isPending: catalystPending,
    isFetching: catalystFetching,
    isError: catalystError,
  } = useCatalystEnrichmentForSymbols(symbols);
  const catalystCheckPending =
    symbols.length > 0 && (catalystPending || (catalystFetching && !catalystMap));
  const entry = catalystMap?.get(sym);

  return (
    <div
      role="button"
      tabIndex={accessible ? 0 : -1}
      onClick={() => {
        if (accessible) onSelect(row);
      }}
      onKeyDown={(e) => {
        if (!accessible) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(row);
        }
      }}
      className={`rounded-lg border border-border bg-card p-3 ${
        !accessible ? "blur-sm select-none pointer-events-none" : ""
      } ${selected ? "ring-1 ring-accent-blue" : ""} ${
        row.rank === 1 && accessible ? "border-amber-500/30" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground">#{row.rank}</span>
            <span className="font-semibold text-accent-blue">{sym}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {row.signal}
            </span>
          </div>
          <div className="text-[12px] text-muted-foreground truncate">{company}</div>
        </div>
        {accessible && (
          <div className="inline-flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!already && !pending) addToWatchlist(sym);
              }}
              disabled={already || pending}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : already ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </button>
            <Link
              to={
                catalystSymbolHref(sym) ??
                `/dashboard/catalyst?symbol=${encodeURIComponent(sym)}`
              }
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <Newspaper className="h-4 w-4" />
            </Link>
            <Link
              to={`/dashboard/ai?symbol=${encodeURIComponent(sym)}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <Sparkles className="h-4 w-4" />
            </Link>
            <Link
              to={`/dashboard/journal?symbol=${encodeURIComponent(sym)}`}
              onClick={(e) => e.stopPropagation()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
            >
              <BookOpen className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums">
        <div>
          <span className="text-muted-foreground">Price </span>
          <span className="font-medium">{formatRadarPrice(row.price)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Move </span>
          <span className={`font-medium ${moveClass(row.change_percent)}`}>
            {formatRadarPercent(row.change_percent)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Vol </span>
          <span className="font-medium">{formatRadarVolume(row.volume)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Vol/Prior </span>
          <span className={volumeRatioClass(row.volume_ratio_prior_session)}>
            {formatRadarMultiplier(row.volume_ratio_prior_session)}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">HOD </span>
          <span className="font-medium">{formatHodDistance(row.hod_distance_percent)}</span>
        </div>
      </div>

      {accessible && (
        <div className="mt-2 text-[12px]">
          {catalystCheckPending ? (
            <span className="text-muted-foreground">Catalyst check pending</span>
          ) : catalystError ? (
            <span className="text-muted-foreground">Catalyst unavailable</span>
          ) : !entry ? (
            <span className="text-muted-foreground">No confirmed catalyst</span>
          ) : (
            <span className="text-muted-foreground">
              {(EVENT_TYPE_LABEL[entry.event.event_type] ?? "Catalyst") +
                (entry.event.title ? ` · ${entry.event.title}` : "")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
