import { Link } from "react-router-dom";
import { Plus, Check, Loader2, Newspaper, Sparkles, BookOpen } from "lucide-react";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { useCatalystEnrichmentForSymbols } from "@/hooks/useCatalystEnrichmentForSymbols";
import { useRadarFloatForSymbols } from "@/hooks/useRadarFloatForSymbols";
import { useRecentProviderNewsForSymbols } from "@/hooks/useRecentProviderNewsForSymbols";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  RADAR_ACTIONS_STICKY_CELL_CLASS,
  RADAR_ACTIONS_STICKY_HEADER_CLASS,
  defaultRadarColumns,
  getRadarColumn,
  radarColumnHelpFieldId,
  radarGridMinWidthPx,
  type RadarColumnId,
} from "./radar-grid-columns";
import {
  formatFreshness,
  formatRadarAcceleration,
  formatRadarContextMultiplier,
  formatRadarContextVolume,
  formatRadarDataTime,
  formatRadarDollarVolume,
  formatRadarPercent,
  formatRadarPrice,
  formatRadarUnavailableMetric,
  formatShortWindowMove,
  formatVwapState,
  isRadarRowAccessible,
  moveClass,
  radarSignalClass,
  volumeRatioClass,
} from "./radar-metrics";
import type { RadarRankedRow } from "./types";
import { useMemo, type ReactNode } from "react";
import { LegacyConfirmedBadge } from "./LegacyConfirmedBadge";
import { ScannerFieldHelp } from "./ScannerFieldHelp";
import { AdaptiveDayRangeBar } from "./AdaptiveDayRangeBar";
import { RadarActionTooltip } from "./RadarActionTooltip";
import { computeFloatTurnover, formatFloatTurnover } from "./float-turnover";
import { NO_VERIFIED_NEWS_COPY, resolveRadarNewsDisplay } from "./radar-news-display";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import type { RecentProviderHeadline } from "@/lib/market-data/recent-news";

interface RadarGridProps {
  rows: RadarRankedRow[];
  selectedSymbol: string | null;
  isPro: boolean;
  freeRowLimit: number;
  onSelect: (row: RadarRankedRow) => void;
  visibleColumns?: RadarColumnId[];
}

function NewsCatalystCell({
  symbol,
  pending,
  error,
  catalyst,
  recent,
}: {
  symbol: string;
  pending: boolean;
  error: boolean;
  catalyst: CatalystEnrichmentEntry | undefined;
  recent: RecentProviderHeadline | undefined;
}) {
  if (pending) {
    return <span className="text-muted-foreground text-xs">News check pending</span>;
  }
  if (error && !catalyst && !recent) {
    return <span className="text-muted-foreground text-xs">News unavailable</span>;
  }
  const display = resolveRadarNewsDisplay(symbol, catalyst, recent);
  if (display.level === "none") {
    return <span className="text-muted-foreground text-xs">{NO_VERIFIED_NEWS_COPY}</span>;
  }
  if (display.level === "recent") {
    return (
      <div className="flex max-w-[220px] flex-col items-start gap-0.5" title={display.title}>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Recent News</span>
        <span className="max-w-full truncate text-[12px] text-foreground">{display.title}</span>
      </div>
    );
  }
  return (
    <Link
      to={display.href}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex max-w-[220px] flex-col items-start gap-0.5 hover:underline"
      title={display.title}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Verified Catalyst · {display.category}
      </span>
      <span className="max-w-full truncate text-[12px] text-foreground">{display.title}</span>
    </Link>
  );
}

function HeaderLabel({ columnId }: { columnId: RadarColumnId }) {
  const column = getRadarColumn(columnId);
  const fieldId = radarColumnHelpFieldId(columnId);
  if (!fieldId) return <>{column.label}</>;
  return <ScannerFieldHelp fieldId={fieldId}>{column.label}</ScannerFieldHelp>;
}

function renderMetricCell(columnId: RadarColumnId, row: RadarRankedRow): ReactNode {
  switch (columnId) {
    case "volume_5s":
      return formatRadarUnavailableMetric(row.rolling_volume_5s);
    case "volume_15s":
      return formatRadarUnavailableMetric(row.rolling_volume_15s);
    case "volume_60s":
      return formatRadarUnavailableMetric(row.rolling_volume_60s);
    case "dollar_volume_60s":
      return formatRadarDollarVolume(row.rolling_dollar_volume_60s);
    case "acceleration_5m":
      return formatRadarAcceleration(row.acceleration_5m);
    case "vwap_state":
      return formatVwapState(row.vwap_side, row.session_vwap);
    case "freshness":
      return formatFreshness(row.freshness_class);
    case "data_time":
      return formatRadarDataTime(row.provider_as_of);
    case "move_15s":
      return formatShortWindowMove(row.move_15s_pct);
    case "move_60s":
      return formatShortWindowMove(row.move_60s_pct);
    default:
      return "Unavailable";
  }
}

export function RadarGrid({
  rows,
  selectedSymbol,
  isPro,
  freeRowLimit,
  onSelect,
  visibleColumns = defaultRadarColumns(),
}: RadarGridProps) {
  const { add: addToWatchlist, isAdded, pendingSymbol } = useAddToWatchlist();

  const symbols = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) {
      if (!isRadarRowAccessible(r.rank, isPro, freeRowLimit)) continue;
      const s = normalizeSymbol(r.symbol);
      if (s) out.push(s);
    }
    return out;
  }, [rows, isPro, freeRowLimit]);

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
  const newsPending = catalystCheckPending || newsState.isPending;

  return (
    <div className="relative rounded-lg border border-border overflow-hidden bg-card hidden md:block min-w-0" data-testid="radar-scanner-table">
      <div className="overflow-x-auto">
      <table
        className="w-full table-fixed text-[11.5px]"
        style={{ minWidth: radarGridMinWidthPx(visibleColumns.length) }}
      >
        <colgroup>
          {visibleColumns.map((columnId) => {
            if (columnId === "rank") return <col key={columnId} className="w-[44px]" />;
            if (columnId === "symbol") return <col key={columnId} className="w-[14%]" />;
            if (columnId === "signal") return <col key={columnId} className="w-[9%]" />;
            if (columnId === "price_move") return <col key={columnId} className="w-[9%]" />;
            if (columnId === "prior_volume") return <col key={columnId} className="w-[8%]" />;
            if (columnId === "volume") return <col key={columnId} className="w-[8%]" />;
            if (columnId === "volume_ratio") return <col key={columnId} className="w-[8%]" />;
            if (columnId === "float") return <col key={columnId} className="w-[8%]" />;
            if (columnId === "float_turnover") return <col key={columnId} className="w-[8%]" />;
            if (columnId === "range_hod") return <col key={columnId} className="w-[16%]" />;
            if (columnId === "catalyst") return <col key={columnId} className="w-[14%]" />;
            if (columnId === "actions") return <col key={columnId} className="w-[160px]" />;
            return <col key={columnId} className="w-[96px]" />;
          })}
        </colgroup>
        <thead className="bg-muted">
          <tr>
            {visibleColumns.map((columnId) => {
              const column = getRadarColumn(columnId);
              return (
                <th
                  key={columnId}
                  className={`px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wide text-muted-foreground ${
                    column.align === "left" ? "text-left" : "text-right"
                  } ${columnId === "actions" ? RADAR_ACTIONS_STICKY_HEADER_CLASS : ""}`}
                >
                  <HeaderLabel columnId={columnId} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const accessible = isRadarRowAccessible(row.rank, isPro, freeRowLimit);
            const selected = selectedSymbol === row.symbol;
            const isLeader = row.rank === 1;
            const sym = row.symbol;
            const company = row.company_name?.trim() || sym;
            const already = isAdded(sym);
            const pending = pendingSymbol === sym;

            return (
              <tr
                key={`${row.tab_id}-${row.symbol}`}
                data-selected={selected ? "true" : undefined}
                data-leader={isLeader && accessible ? "true" : undefined}
                onClick={() => {
                  if (accessible) onSelect(row);
                }}
                className={`group border-t border-border transition-colors ${
                  !accessible
                    ? "blur-sm select-none pointer-events-none"
                    : "cursor-pointer hover:bg-muted/40"
                } ${selected ? "bg-accent-blue-light" : ""} ${
                  isLeader && accessible && !selected ? "bg-muted" : ""
                }`}
              >
                {visibleColumns.map((columnId) => {
                  if (columnId === "rank") {
                    return (
                      <td key={columnId} className="px-2 py-1.5 tabular-nums font-semibold text-muted-foreground">
                        #{row.rank}
                      </td>
                    );
                  }
                  if (columnId === "symbol") {
                    return (
                      <td key={columnId} className="px-2 py-1.5 min-w-0">
                        <Link
                          to={`/stocks/${sym}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-semibold tracking-wide tabular-nums text-accent-blue hover:underline"
                        >
                          {sym}
                        </Link>
                        <div className={`text-[10px] font-semibold uppercase tracking-wide ${radarSignalClass(row.signal)}`}>
                          {row.signal}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{company}</div>
                        <LegacyConfirmedBadge confirmed={row.legacy_confirmed} />
                      </td>
                    );
                  }
                  if (columnId === "signal") {
                    return (
                      <td key={columnId} className="px-2 py-1.5">
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide ${radarSignalClass(row.signal)}`}
                        >
                          {row.signal}
                        </span>
                      </td>
                    );
                  }
                  if (columnId === "price_move") {
                    return (
                      <td key={columnId} className="px-2 py-1.5 text-right tabular-nums">
                        <div>{formatRadarPrice(row.price)}</div>
                        <div className={moveClass(row.change_percent)}>
                          {formatRadarPercent(row.change_percent)}
                        </div>
                      </td>
                    );
                  }
                  if (columnId === "range_hod") {
                    return (
                      <td key={columnId} className="px-2 py-1.5">
                        <AdaptiveDayRangeBar
                          price={row.price}
                          dayLow={row.day_low}
                          dayHigh={row.day_high}
                          hodDistancePercent={row.hod_distance_percent}
                        />
                      </td>
                    );
                  }
                  if (columnId === "volume") {
                    return (
                      <td key={columnId} className="px-2 py-1.5 text-right tabular-nums font-medium">
                        {formatRadarContextVolume(row.volume)}
                      </td>
                    );
                  }
                  if (columnId === "prior_volume") {
                    return (
                      <td key={columnId} className="px-2 py-1.5 text-right tabular-nums">
                        {formatRadarContextVolume(row.prior_session_volume)}
                      </td>
                    );
                  }
                  if (columnId === "volume_ratio") {
                    return (
                      <td key={columnId} className={`px-2 py-1.5 text-right tabular-nums ${volumeRatioClass(row.volume_ratio_prior_session)}`}>
                        {formatRadarContextMultiplier(row.volume_ratio_prior_session)}
                      </td>
                    );
                  }
                  if (columnId === "float") {
                    const floatShares = floatState.getFloat(sym);
                    return (
                      <td key={columnId} className="px-2 py-1.5 text-right tabular-nums">
                        {floatState.isPending && floatShares === null
                          ? "…"
                          : formatRadarContextVolume(floatShares)}
                      </td>
                    );
                  }
                  if (columnId === "float_turnover") {
                    const turnover = computeFloatTurnover(row.volume, floatState.getFloat(sym));
                    return (
                      <td key={columnId} className="px-2 py-1.5 text-right tabular-nums">
                        {formatFloatTurnover(turnover)}
                      </td>
                    );
                  }
                  if (columnId === "catalyst") {
                    return (
                      <td key={columnId} className="px-2 py-1.5 min-w-0">
                        {accessible ? (
                          <NewsCatalystCell
                            symbol={sym}
                            pending={newsPending && !catalystMap?.get(sym) && !newsState.getHeadline(sym)}
                            error={!!catalystError}
                            catalyst={catalystMap?.get(sym)}
                            recent={newsState.getHeadline(sym)}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  }
                  if (columnId === "actions") {
                    return (
                      <td
                        key={columnId}
                        className={`px-2 py-1.5 ${RADAR_ACTIONS_STICKY_CELL_CLASS} ${
                          selected
                            ? "bg-accent-blue-light group-hover:bg-accent-blue-light"
                            : isLeader && accessible
                              ? "bg-muted group-hover:bg-muted"
                              : `bg-card${accessible ? " group-hover:bg-muted" : ""}`
                        }`}
                      >
                        {accessible && (
                          <div className="inline-flex items-center gap-0.5 whitespace-nowrap">
                            <RadarActionTooltip label={already ? "In Watchlist" : "Add to Watchlist"}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!already && !pending) addToWatchlist(sym);
                                }}
                                disabled={already || pending}
                                aria-label={
                                  already ? `${sym} is in watchlist` : `Add ${sym} to watchlist`
                                }
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-70"
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
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <Newspaper className="h-4 w-4" />
                              </Link>
                            </RadarActionTooltip>
                            <RadarActionTooltip label="Ask AI Analyst">
                              <Link
                                to={`/dashboard/ai?symbol=${encodeURIComponent(sym)}`}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Ask AI Analyst about ${sym}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <Sparkles className="h-4 w-4" />
                              </Link>
                            </RadarActionTooltip>
                            <RadarActionTooltip label="Open Trading Journal">
                              <Link
                                to={`/dashboard/journal?symbol=${encodeURIComponent(sym)}`}
                                onClick={(e) => e.stopPropagation()}
                                aria-label={`Open journal for ${sym}`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <BookOpen className="h-4 w-4" />
                              </Link>
                            </RadarActionTooltip>
                          </div>
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={columnId} className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                      {renderMetricCell(columnId, row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
