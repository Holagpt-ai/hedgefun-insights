import { Link } from "react-router-dom";
import { Plus, Check, Loader2, Newspaper, Sparkles, BookOpen } from "lucide-react";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { useCatalystEnrichmentForSymbols } from "@/hooks/useCatalystEnrichmentForSymbols";
import { useRadarFloatForSymbols } from "@/hooks/useRadarFloatForSymbols";
import { useRecentProviderNewsForSymbols } from "@/hooks/useRecentProviderNewsForSymbols";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  formatRadarContextMultiplier,
  formatRadarContextVolume,
  formatRadarPercent,
  formatRadarPrice,
  isRadarRowAccessible,
  moveClass,
  radarSignalClass,
  volumeRatioClass,
} from "./radar-metrics";
import type { RadarRankedRow } from "./types";
import { LegacyConfirmedBadge } from "./LegacyConfirmedBadge";
import { ScannerFieldHelp } from "./ScannerFieldHelp";
import { AdaptiveDayRangeBar } from "./AdaptiveDayRangeBar";
import { RadarActionTooltip } from "./RadarActionTooltip";
import { computeFloatTurnover, formatFloatTurnover } from "./float-turnover";
import { NO_VERIFIED_NEWS_COPY, resolveRadarNewsCellState } from "./radar-news-display";
import {
  formatScreenerDollarVolume,
  formatScreenerRvol20d,
} from "@/lib/screeners/screener-metric-display";

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
  const accessible = isRadarRowAccessible(row.access_rank ?? row.rank, isPro, freeRowLimit);
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
  const floatState = useRadarFloatForSymbols(symbols);
  const newsState = useRecentProviderNewsForSymbols(symbols);
  const catalystCheckPending =
    symbols.length > 0 && (catalystPending || (catalystFetching && !catalystMap));
  const entry = catalystMap?.get(sym);
  const floatShares = floatState.getFloat(sym);
  const turnover = computeFloatTurnover(row.volume, floatShares);
  const news = resolveRadarNewsCellState({
    symbol: sym,
    catalyst: entry,
    recent: newsState.getHeadline(sym),
    newsStatus: newsState.getStatus(sym),
    catalystPending: catalystCheckPending && !entry,
    catalystUnavailable: !!catalystError && !entry,
  });

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
      className={`rounded-lg border border-border bg-card p-2.5 ${
        !accessible ? "blur-sm select-none pointer-events-none" : ""
      } ${selected ? "ring-1 ring-accent-blue" : ""} ${
        row.rank === 1 && accessible ? "border-amber-500/30" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-muted-foreground">#{row.rank}</span>
            <span className="font-semibold tracking-wide tabular-nums text-accent-blue">{sym}</span>
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${radarSignalClass(row.signal)}`}>
              {row.signal}
            </span>
            <LegacyConfirmedBadge confirmed={row.legacy_confirmed} />
          </div>
          <div className="text-[12px] text-muted-foreground truncate">{company}</div>
        </div>
        {accessible && (
          <div className="inline-flex items-center gap-0.5 shrink-0">
            <RadarActionTooltip label={already ? "In Watchlist" : "Add to Watchlist"}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!already && !pending) addToWatchlist(sym);
                }}
                disabled={already || pending}
                aria-label={already ? `${sym} is in watchlist` : `Add ${sym} to watchlist`}
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
            </RadarActionTooltip>
            <RadarActionTooltip label="News / Catalyst">
              <Link
                to={
                  catalystSymbolHref(sym) ??
                  `/dashboard/catalyst?symbol=${encodeURIComponent(sym)}`
                }
                onClick={(e) => e.stopPropagation()}
                aria-label={`View catalysts for ${sym}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <Newspaper className="h-4 w-4" />
              </Link>
            </RadarActionTooltip>
            <RadarActionTooltip label="Ask AI Analyst">
              <Link
                to={`/dashboard/ai?symbol=${encodeURIComponent(sym)}`}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Ask AI Analyst about ${sym}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <Sparkles className="h-4 w-4" />
              </Link>
            </RadarActionTooltip>
            <RadarActionTooltip label="Open Trading Journal">
              <Link
                to={`/dashboard/journal?symbol=${encodeURIComponent(sym)}`}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Open journal for ${sym}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <BookOpen className="h-4 w-4" />
              </Link>
            </RadarActionTooltip>
          </div>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] tabular-nums">
        <div>
          <ScannerFieldHelp fieldId="price" className="text-muted-foreground">
            Price
          </ScannerFieldHelp>{" "}
          <span className="font-medium">{formatRadarPrice(row.price)}</span>
        </div>
        <div>
          <ScannerFieldHelp fieldId="move" className="text-muted-foreground">
            Move
          </ScannerFieldHelp>{" "}
          <span className={`font-medium ${moveClass(row.change_percent)}`}>
            {formatRadarPercent(row.change_percent)}
          </span>
        </div>
      </div>
      <div className="mt-1 text-[12px] tabular-nums text-muted-foreground">
        Today Vol {formatRadarContextVolume(row.volume)}
        {" · "}
        <ScannerFieldHelp fieldId="dollar_volume" className="text-muted-foreground">
          $ Vol
        </ScannerFieldHelp>{" "}
        <span className="text-foreground">{formatScreenerDollarVolume(row.price, row.volume, row)}</span>
        {" · "}
        <ScannerFieldHelp fieldId="daily_rvol" className="text-muted-foreground">
          RVOL 20D
        </ScannerFieldHelp>{" "}
        <span className="text-foreground">{formatScreenerRvol20d(row.rvol_20d, row)}</span>
        {" · "}
        Prior {formatRadarContextVolume(row.prior_session_volume)}
        {" · "}
        <span className={volumeRatioClass(row.volume_ratio_prior_session)}>
          {formatRadarContextMultiplier(row.volume_ratio_prior_session)}
        </span>
      </div>
      <div className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">
        Float {formatRadarContextVolume(floatShares)} · Turnover {formatFloatTurnover(turnover)}
      </div>
      <div className="mt-1.5">
        <ScannerFieldHelp fieldId="day_range" className="text-muted-foreground text-[11px]">
          Day Range
        </ScannerFieldHelp>
        <AdaptiveDayRangeBar
          price={row.price}
          dayLow={row.day_low}
          dayHigh={row.day_high}
          hodDistancePercent={row.hod_distance_percent}
        />
      </div>

      {accessible && (
        <div className="mt-1.5 text-[12px]">
          {news.level === "pending" ? (
            <span className="text-muted-foreground">News check pending</span>
          ) : news.level === "unavailable" ? (
            <span className="text-muted-foreground">News unavailable</span>
          ) : news.level === "none" ? (
            <span className="text-muted-foreground">{NO_VERIFIED_NEWS_COPY}</span>
          ) : news.level === "recent" ? (
            <span className="text-muted-foreground" title={news.title}>
              Recent News
              {news.source || news.ageLabel ? ` · ${[news.source, news.ageLabel].filter(Boolean).join(" · ")}` : ""}
              {` · ${news.title}`}
            </span>
          ) : (
            <span className="text-muted-foreground" title={news.title}>
              Verified Catalyst · {news.category}
              {news.ageLabel ? ` · ${news.ageLabel}` : ""}
              {news.title ? ` · ${news.title}` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
