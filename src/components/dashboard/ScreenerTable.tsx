import { useState, useMemo, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Check, Loader2, Newspaper, Sparkles } from "lucide-react";
import { ScreenerTab, ColumnFormat, ScreenerColumn } from "@/config/screener-tabs.config";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { useCatalystEnrichmentForSymbols } from "@/hooks/useCatalystEnrichmentForSymbols";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";
import { EVENT_TYPE_LABEL, normalizeSymbol } from "@/lib/catalyst/parsers";
import {
  formatDayRange,
  formatRangeEvent,
  volumeRatioBadgeClass,
  type ScreenerResultRow,
  type ScreenerUiStatus,
} from "@/lib/screeners/contract";
import { resolveScreenerCopy, type ScreenerDataSource } from "@/lib/screeners/screener-copy";
import type { ScreenerTruthState } from "@/lib/screeners/screener-truth-state";
import { ScannerFieldHelp } from "@/features/day-trade-radar-v2/ScannerFieldHelp";
import { ScreenerFiltersControl } from "@/components/screener/ScreenerFiltersControl";
import { useScreenerFilters } from "@/hooks/useScreenerFilters";
import {
  finiteMetric,
  formatScreenerDollarVolume,
  formatScreenerMetric,
  formatScreenerRvol20d,
  formatScreenerVolumeAccelerationPct,
} from "@/lib/screeners/screener-metric-display";
import { applyScreenerRowFilters } from "@/lib/screeners/screener-filters";
import {
  evaluateScreenerTradeQuality,
  formatScreenerTradeQualityFromRow,
} from "@/lib/screeners/screener-trade-quality";
import {
  evaluateScreenerTriggerTime,
  formatScreenerTriggerTimeFromRow,
  triggerTypeLabel,
} from "@/lib/screeners/screener-trigger-time";
import { TriggeredTimeCell } from "@/components/screener/TriggeredTimeCell";
import { HistoryCell } from "@/features/day-trade-radar-v2/HistoricalBehavior";
import type { RadarHistoricalContextFields } from "@/lib/radar/radar-historical-context-types";
import { evaluateScreenerShortFloat } from "@/lib/screeners/screener-short-float";
import { evaluateScreenerContinuation } from "@/lib/screeners/screener-continuation";

interface ScreenerTableProps {
  tab: ScreenerTab;
  isPro: boolean;
  rows?: ScreenerResultRow[];
  status?: ScreenerUiStatus;
  /** Active data source, for session-aware criteria/description copy. */
  source?: ScreenerDataSource | null;
  /** Accepted Radar V2 generation session_kind. */
  session?: string | null;
  /** Canonical truth-state for empty/unavailable/initializing rendering. */
  truthState?: ScreenerTruthState | null;
}

function desktopColClass(key: string): string {
  switch (key) {
    case "discovery_rank":
      return "w-[44px]";
    case "symbol":
      return "w-[12%]";
    case "company_name":
      return "w-[16%]";
    case "catalyst_news":
      return "w-[20%]";
    case "actions":
      return "w-[120px]";
    case "range_event":
      return "w-[8%]";
    case "day_range":
      return "w-[10%]";
    case "dollar_volume":
    case "rvol_20d":
    case "trade_quality":
    case "trigger_time":
      return "w-[8%]";
    default:
      return "w-[8%]";
  }
}

function rowKey(row: Pick<ScreenerResultRow, "tab_id" | "symbol">): string {
  return `${row.tab_id}::${row.symbol}`;
}

function percentClass(value: number): string {
  if (value > 0) return "text-green-600";
  if (value < 0) return "text-red-600";
  return "text-foreground";
}

function isCompanyEmpty(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

function screenerColumnFieldId(key: string): string | null {
  switch (key) {
    case "symbol":
      return "symbol";
    case "price":
      return "price";
    case "change_percent":
    case "gap_percent":
      return "move";
    case "volume":
      return "volume";
    case "prior_session_volume":
      return "prior_volume";
    case "volume_ratio_prior_session":
      return "volume_ratio";
    case "day_range":
      return "day_range";
    case "dollar_volume":
      return "dollar_volume";
    case "rvol_20d":
      return "daily_rvol";
    case "trade_quality":
      return "trade_quality";
    case "trigger_time":
      return "trigger_time";
    case "history":
      return "history";
    case "rvol_5m":
      return "rvol_5m";
    case "vol_velocity":
      return "vol_velocity";
    case "catalyst_news":
      return "catalyst";
    default:
      return null;
  }
}

export function ScreenerTable({
  tab,
  isPro,
  rows = [],
  status = "loading",
  source = null,
  session = null,
  truthState = null,
}: ScreenerTableProps) {
  const copy = resolveScreenerCopy(tab, source, session);
  const navigate = useNavigate();
  const { add: addToWatchlist, isAdded, pendingSymbol } = useAddToWatchlist();
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const filters = useScreenerFilters();

  const loading = status === "loading";
  const showRows = truthState?.showRows ?? (status === "available" || status === "stale");
  const hasVerifiedRows = showRows && rows.length > 0;
  const emptyTitle = truthState?.title ?? "No qualifying securities";
  const emptyExplanation =
    truthState?.explanation ??
    "No securities met this screener's criteria in the latest validated evaluation.";
  const unavailableTitle = truthState?.title ?? "Screener unavailable";
  const unavailableExplanation =
    truthState?.explanation ??
    "Screener data is temporarily unavailable. No unverified rows are being shown.";

  const handleSortClick = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "desc" };
      if (prev.direction === "desc") return { key, direction: "asc" };
      return null;
    });
  };

  const discoveryRankByKey = useMemo(() => {
    const ranks = new Map<string, number>();
    rows.forEach((row, index) => ranks.set(rowKey(row), index + 1));
    return ranks;
  }, [rows]);

  const getDiscoveryRank = useCallback((row: ScreenerResultRow): number | null => {
    return discoveryRankByKey.get(rowKey(row)) ?? null;
  }, [discoveryRankByKey]);

  const getSortValue = useCallback((row: ScreenerResultRow, key: string): string | number | null | undefined => {
    if (key === "discovery_rank") return getDiscoveryRank(row);
    if (key === "dollar_volume") {
      const price = finiteMetric(row.price);
      const volume = finiteMetric(row.volume);
      return price === null || volume === null ? null : price * volume;
    }
    if (key === "trade_quality") {
      return evaluateScreenerTradeQuality(row).score;
    }
    if (key === "trigger_time") {
      const primary = evaluateScreenerTriggerTime(row).primary;
      return primary ? Date.parse(primary.triggeredAt) : null;
    }
    return (row as unknown as Record<string, string | number | null | undefined>)[key];
  }, [getDiscoveryRank]);

  const sortedRows = useMemo(() => {
    const baseRows = hasVerifiedRows ? rows : [];
    const visibleRows = applyScreenerRowFilters(baseRows, filters.filterSet, (row) => {
      return discoveryRankByKey.get(rowKey(row)) ?? 0;
    });
    if (!sort) return visibleRows;
    const col = tab.columns.find((c) => c.key === sort.key);
    if (!col) return visibleRows;
    const dir = sort.direction === "asc" ? 1 : -1;
    const isText = col.format === "text";
    return [...visibleRows].sort((a, b) => {
      const av = getSortValue(a, sort.key);
      const bv = getSortValue(b, sort.key);
      const aNull = av === null || av === undefined || av === "";
      const bNull = bv === null || bv === undefined || bv === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (isText) return String(av).localeCompare(String(bv)) * dir;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [sort, tab.columns, rows, hasVerifiedRows, getSortValue, filters.filterSet, discoveryRankByKey]);

  const enrichmentSymbols = useMemo(() => {
    const out: string[] = [];
    for (const r of sortedRows) {
      const s = normalizeSymbol(r?.symbol);
      if (s) out.push(s);
    }
    return out;
  }, [sortedRows]);
  const {
    data: catalystMap,
    isPending: catalystPending,
    isFetching: catalystFetching,
    isError: catalystError,
  } = useCatalystEnrichmentForSymbols(enrichmentSymbols);
  // Never conflate in-flight enrichment with verified-empty.
  const catalystCheckPending =
    enrichmentSymbols.length > 0 &&
    (catalystPending || (catalystFetching && !catalystMap));

  const isFullGate = !isPro && tab.freeRowLimit === 0;
  const visibleCount = isPro ? sortedRows.length : tab.freeRowLimit;

  const renderWatchlistButton = (sym: string) => {
    const already = isAdded(sym);
    const pending = pendingSymbol === sym;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (already || pending) return;
          addToWatchlist(sym);
        }}
        disabled={already || pending}
        aria-label={already ? `${sym} is in watchlist` : `Add ${sym} to watchlist`}
        title={already ? "In watchlist" : `Add ${sym} to watchlist`}
        className={`inline-flex items-center justify-center h-8 w-8 rounded-md transition-colors ${
          already
            ? "text-green-600 cursor-default"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        } disabled:opacity-70 disabled:cursor-not-allowed`}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : already ? (
          <Check className="h-4 w-4" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
      </button>
    );
  };

  const renderCatalystButton = (sym: string) => {
    const href = catalystSymbolHref(sym);
    if (!href) return null;
    return (
      <Link
        to={href}
        aria-label={`View catalysts for ${sym}`}
        title={`View catalysts for ${sym}`}
        className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <Newspaper className="h-4 w-4" />
      </Link>
    );
  };

  const renderAiButton = (sym: string) => (
    <Link
      to={`/dashboard/ai?symbol=${encodeURIComponent(sym)}`}
      aria-label={`Ask AI Analyst about ${sym}`}
      title={`Ask AI Analyst about ${sym}`}
      className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      onClick={(e) => e.stopPropagation()}
    >
      <Sparkles className="h-4 w-4" />
    </Link>
  );

  const renderCatalystCell = (sym: string) => {
    if (catalystCheckPending) {
      return <span className="text-muted-foreground text-xs">Catalyst check pending</span>;
    }
    if (catalystError) {
      return <span className="text-muted-foreground text-xs">Catalyst unavailable</span>;
    }
    const entry = catalystMap?.get(sym);
    if (!entry) {
      return (
        <span className="text-muted-foreground text-xs">
          No provider-reported catalyst found
        </span>
      );
    }
    const label = EVENT_TYPE_LABEL[entry.event.event_type];
    const kindLabel = entry.kind === "upcoming" ? "Upcoming" : "Recent";
    const href = catalystSymbolHref(sym) ?? `/dashboard/catalyst?symbol=${encodeURIComponent(sym)}`;
    return (
      <Link
        to={href}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex max-w-full items-center hover:underline"
        title={entry.event.title ?? label}
      >
        <span className="mr-1 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
          {kindLabel} · {label}
        </span>
        <span className="max-w-[220px] truncate text-[12px] text-foreground">
          {entry.event.title ?? entry.event.company_name ?? sym}
        </span>
      </Link>
    );
  };

  const renderCellContent = (row: ScreenerResultRow, col: ScreenerColumn, blurred: boolean) => {
    const raw = (row as unknown as Record<string, unknown>)[col.key];
    const sym = normalizeSymbol(row.symbol) ?? String(row.symbol ?? "").toUpperCase();

    if (col.key === "discovery_rank") {
      return formatScreenerMetric(getDiscoveryRank(row), "rank");
    }

    if (col.key === "symbol") {
      const showInlineActions = tab.columns.every((c) => c.key !== "actions");
      const shortFloat = evaluateScreenerShortFloat(row);
      const continuation = evaluateScreenerContinuation(row);
      return (
        <div className="min-w-0">
          <div className="inline-flex min-w-0 items-center gap-1.5">
            <Link
              to={`/stocks/${raw}`}
              className="inline-flex min-h-[32px] items-center font-semibold tracking-wide tabular-nums text-accent-blue hover:underline"
            >
              {formatScreenerMetric(raw as string, col.format)}
            </Link>
            {hasVerifiedRows && !blurred && showInlineActions && (
              <div className="inline-flex items-center gap-0.5">
                {renderWatchlistButton(sym)}
                {renderCatalystButton(sym)}
                {renderAiButton(sym)}
              </div>
            )}
          </div>
          <div className="text-[10px] leading-tight text-muted-foreground">
            <ScannerFieldHelp fieldId="short_float" className="text-muted-foreground">
              Short
            </ScannerFieldHelp>{" "}
            <span className="tabular-nums text-foreground" title={shortFloat.title}>
              {shortFloat.display}
            </span>
            {" · "}
            <span>Cont</span>{" "}
            <span className="tabular-nums text-foreground" title={continuation.title}>
              {continuation.display}
            </span>
          </div>
        </div>
      );
    }

    if (col.key === "actions") {
      if (!hasVerifiedRows || blurred) return "—";
      return (
        <div className="inline-flex items-center gap-0.5">
          {renderWatchlistButton(sym)}
          {renderCatalystButton(sym)}
          {renderAiButton(sym)}
        </div>
      );
    }

    if (col.key === "range_event") {
      return formatRangeEvent(row.range_event);
    }

    if (col.key === "company_name") {
      if (isCompanyEmpty(raw)) {
        return <span className="italic text-muted-foreground">{sym || "—"}</span>;
      }
      return String(raw);
    }

    if (col.key === "day_range") {
      return (
        <span className="text-muted-foreground text-xs">
          {formatDayRange(row.day_low, row.day_high)}
        </span>
      );
    }

    if (col.key === "catalyst_news") {
      return renderCatalystCell(sym);
    }

    if (col.key === "dollar_volume") {
      return formatScreenerDollarVolume(row.price, row.volume, row);
    }

    if (col.key === "rvol_20d") {
      return formatScreenerRvol20d(row.rvol_20d, row);
    }

    if (col.key === "trade_quality") {
      return formatScreenerTradeQualityFromRow(row);
    }

    if (col.key === "acceleration") {
      const pct = (row as ScreenerResultRow & { volume_acceleration_pct?: number | null })
        .volume_acceleration_pct;
      return formatScreenerVolumeAccelerationPct(pct);
    }

    if (col.format === "unavailable") {
      return "—";
    }

    if (col.key === "history") {
      const context = (row as ScreenerResultRow & RadarHistoricalContextFields).historicalContext;
      return <HistoryCell context={context ?? null} />;
    }

    if (col.key === "trigger_time") {
      const view = evaluateScreenerTriggerTime(row);
      return (
        <TriggeredTimeCell
          triggeredAt={view.primary?.triggeredAt}
          title={view.primary ? `${triggerTypeLabel(view.primary.triggerType)} trigger` : "Triggered unavailable"}
        />
      );
    }

    if (col.key === "volume_ratio_prior_session" && col.format === "multiplier") {
      return (
        <span className={volumeRatioBadgeClass(Number(raw))}>
          {formatScreenerMetric(raw as number, col.format)}
        </span>
      );
    }

    return formatScreenerMetric(raw as string | number | null | undefined, col.format);
  };

  return (
    <div className="space-y-3">
      {hasVerifiedRows && (
        <ScreenerFiltersControl
          draft={filters.draft}
          activeCount={filters.activeCount}
          onChange={filters.update}
          onClear={filters.clear}
        />
      )}
      {copy.criteria.length > 0 && (
        <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5">
          {copy.criteria.map((c) => (
            <span
              key={c}
              className="shrink-0 rounded-md bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground"
            >
              {c}
            </span>
          ))}
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && status === "unavailable" && (
        <div className="rounded-lg border border-border bg-card p-10 text-center space-y-2">
          <div className="text-sm font-semibold text-foreground">{unavailableTitle}</div>
          <p className="text-sm text-muted-foreground">{unavailableExplanation}</p>
        </div>
      )}

      {!loading && status === "initializing" && (
        <div className="rounded-lg border border-border bg-card p-10 text-center space-y-2">
          <div className="text-sm font-semibold text-foreground">{emptyTitle}</div>
          <p className="text-sm text-muted-foreground">{emptyExplanation}</p>
        </div>
      )}

      {!loading && status === "empty" && (
        <div className="rounded-lg border border-border bg-card p-10 text-center space-y-2">
          <div className="text-sm font-semibold text-foreground">{emptyTitle}</div>
          <p className="text-sm text-muted-foreground">{emptyExplanation}</p>
        </div>
      )}

      {!loading && truthState?.advisory && hasVerifiedRows && (
        <div
          role="status"
          className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground"
        >
          {truthState.advisory}
        </div>
      )}

      {!loading && hasVerifiedRows && (
        <div className="relative rounded-lg border border-border overflow-hidden bg-card hidden md:block min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] table-fixed text-[11.5px]">
              <colgroup>
                {tab.columns.map((col) => (
                  <col key={`col-${col.key}`} className={desktopColClass(col.key)} />
                ))}
              </colgroup>
              <thead className="bg-muted/50">
                <tr>
                  {tab.columns.map((col) => {
                    const active = sort?.key === col.key;
                    const indicator = active ? (sort!.direction === "asc" ? " ▲" : " ▼") : "";
                    return (
                      <th
                        key={col.key}
                        onClick={() => handleSortClick(col.key)}
                        className={`px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wide cursor-pointer select-none hover:text-foreground transition-colors ${
                          active ? "text-foreground" : "text-muted-foreground"
                        } ${col.align === "right" ? "text-right" : "text-left"}`}
                      >
                        {screenerColumnFieldId(col.key) ? (
                          <ScannerFieldHelp fieldId={screenerColumnFieldId(col.key) ?? ""}>
                            {col.label}
                          </ScannerFieldHelp>
                        ) : (
                          col.label
                        )}
                        <span className="text-accent-blue">{indicator}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => {
                  const blurred = !isPro && idx >= visibleCount;
                  return (
                    <tr
                      key={`${row.tab_id}-${row.symbol}`}
                      className={`border-t border-border hover:bg-muted/20 ${
                        blurred ? "blur-sm select-none pointer-events-none" : ""
                      }`}
                    >
                      {tab.columns.map((col) => {
                        const raw = (row as unknown as Record<string, unknown>)[col.key];
                        const isPct = col.format === "percent";
                        return (
                          <td
                            key={col.key}
                            className={`px-2 py-1.5 align-middle tabular-nums ${
                              col.align === "right" ? "text-right" : "text-left"
                            } ${isPct ? percentClass(Number(raw)) : ""}`}
                          >
                            {renderCellContent(row, col, blurred)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {isFullGate && (
            <div className="absolute inset-0 backdrop-blur-sm bg-background/70 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <div className="text-2xl">⚡</div>
              <div className="text-sm font-semibold text-foreground">
                {tab.label} — Pro Feature
              </div>
              <div className="text-[12px] text-muted-foreground max-w-sm">
                {copy.description}
              </div>
              <button
                onClick={() => navigate("/pro")}
                className="mt-1 bg-accent-blue text-white text-[13px] font-semibold px-5 py-2 rounded-md hover:opacity-90 transition-opacity duration-200"
              >
                Unlock with Pro access
              </button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Or go Unlimited for full access.
              </p>
            </div>
          )}
        </div>
      )}

      {!loading && hasVerifiedRows && (
        <div className="relative space-y-2 md:hidden">
          {sortedRows.map((row, idx) => {
            const blurred = !isPro && idx >= visibleCount;
            const sym = String(row.symbol ?? "").toUpperCase();
            const company = row.company_name;
            const colKeys = new Set(tab.columns.map((c) => c.key));
            const showPrice = colKeys.has("price");
            const showVolume = colKeys.has("volume");
            const showDollarVolume = colKeys.has("dollar_volume");
            const showRvol20d = colKeys.has("rvol_20d");
            const showTradeQuality = colKeys.has("trade_quality");
            const showTriggerTime = colKeys.has("trigger_time");
            const showPriorVol = colKeys.has("prior_session_volume");
            const showVolRatio = colKeys.has("volume_ratio_prior_session");
            const showDayRange = colKeys.has("day_range");
            const showCatalyst = colKeys.has("catalyst_news");
            const showEvent = colKeys.has("range_event");
            const showHigh52 = colKeys.has("high_52w");
            const showLow52 = colKeys.has("low_52w");
            const useGap = colKeys.has("gap_percent");
            const useMove = colKeys.has("change_percent");
            const movementValue = useGap
              ? row.gap_percent
              : useMove
                ? row.change_percent
                : null;
            const movementLabel = useGap ? "Gap" : useMove ? "Move" : null;
            const shortFloat = evaluateScreenerShortFloat(row);
            const continuation = evaluateScreenerContinuation(row);
            return (
              <div
                key={`${row.tab_id}-${row.symbol}`}
                className={`rounded-lg border border-border bg-card p-2.5 ${
                  blurred ? "blur-sm select-none pointer-events-none" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {formatScreenerMetric(getDiscoveryRank(row), "rank")}
                      </span>
                      <Link
                        to={`/stocks/${sym}`}
                        className="font-semibold tracking-wide tabular-nums text-accent-blue hover:underline"
                      >
                        {sym}
                      </Link>
                    </div>
                    <div className="truncate text-[11.5px]">
                      {isCompanyEmpty(company) ? (
                        <span className="italic text-muted-foreground">{sym}</span>
                      ) : (
                        <span className="text-muted-foreground">{String(company)}</span>
                      )}
                    </div>
                  </div>
                  {hasVerifiedRows && !blurred && (
                    <div className="inline-flex items-center gap-0.5 shrink-0">
                      {renderWatchlistButton(sym)}
                      {renderCatalystButton(sym)}
                      {renderAiButton(sym)}
                    </div>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tabular-nums">
                  {showEvent && (
                    <div>
                      <span className="text-muted-foreground">Event </span>
                      <span className="font-medium">{formatRangeEvent(row.range_event)}</span>
                    </div>
                  )}
                  {showPrice && row.price !== null && row.price !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Price </span>
                      <span className="font-medium">{formatScreenerMetric(row.price, "price")}</span>
                    </div>
                  )}
                  {movementLabel &&
                    movementValue !== null &&
                    movementValue !== undefined && (
                      <div>
                        <span className="text-muted-foreground">{movementLabel} </span>
                        <span className={`font-medium ${percentClass(Number(movementValue))}`}>
                          {formatScreenerMetric(movementValue, "percent")}
                        </span>
                      </div>
                    )}
                  {showVolume && row.volume !== null && row.volume !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Volume </span>
                      <span className="font-medium">{formatScreenerMetric(row.volume, "volume")}</span>
                    </div>
                  )}
                  {showDollarVolume && (
                    <div>
                      <ScannerFieldHelp fieldId="dollar_volume" className="text-muted-foreground">
                        $ Vol
                      </ScannerFieldHelp>{" "}
                      <span className="font-medium">
                        {formatScreenerDollarVolume(row.price, row.volume, row)}
                      </span>
                    </div>
                  )}
                  {showRvol20d && (
                    <div>
                      <ScannerFieldHelp fieldId="daily_rvol" className="text-muted-foreground">
                        RVOL 20D
                      </ScannerFieldHelp>{" "}
                      <span className="font-medium">{formatScreenerRvol20d(row.rvol_20d, row)}</span>
                    </div>
                  )}
                  {showTradeQuality && (
                    <div>
                      <ScannerFieldHelp fieldId="trade_quality" className="text-muted-foreground">
                        Trade Quality
                      </ScannerFieldHelp>{" "}
                      <span className="font-medium">{formatScreenerTradeQualityFromRow(row)}</span>
                    </div>
                  )}
                  {showTriggerTime && (
                    <div>
                      <ScannerFieldHelp fieldId="trigger_time" className="text-muted-foreground">
                        Trigger
                      </ScannerFieldHelp>{" "}
                      <span
                        className="font-medium"
                        title={
                          evaluateScreenerTriggerTime(row).primary
                            ? `${triggerTypeLabel(evaluateScreenerTriggerTime(row).primary?.triggerType)} trigger`
                            : "Trigger Time unavailable"
                        }
                      >
                        {formatScreenerTriggerTimeFromRow(row)}
                      </span>
                    </div>
                  )}
                  <div>
                    <ScannerFieldHelp fieldId="short_float" className="text-muted-foreground">
                      Short
                    </ScannerFieldHelp>{" "}
                    <span className="font-medium" title={shortFloat.title}>
                      {shortFloat.display}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Cont </span>
                    <span className="font-medium" title={continuation.title}>
                      {continuation.display}
                    </span>
                  </div>
                  {showPriorVol &&
                    row.prior_session_volume !== null &&
                    row.prior_session_volume !== undefined && (
                      <div>
                        <span className="text-muted-foreground">Prior Vol </span>
                        <span className="font-medium">
                          {formatScreenerMetric(row.prior_session_volume, "volume")}
                        </span>
                      </div>
                    )}
                  {showVolRatio &&
                    row.volume_ratio_prior_session !== null &&
                    row.volume_ratio_prior_session !== undefined && (
                      <div>
                        <span className="text-muted-foreground">Vol / Prior </span>
                        <span className={volumeRatioBadgeClass(Number(row.volume_ratio_prior_session))}>
                          {formatScreenerMetric(row.volume_ratio_prior_session, "multiplier")}
                        </span>
                      </div>
                    )}
                  {showDayRange && (
                    <div>
                      <span className="text-muted-foreground">Range </span>
                      <span className="font-medium">
                        {formatDayRange(row.day_low, row.day_high)}
                      </span>
                    </div>
                  )}
                  {showHigh52 && row.high_52w !== null && row.high_52w !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Prior 52W High </span>
                      <span className="font-medium">{formatScreenerMetric(row.high_52w, "price")}</span>
                    </div>
                  )}
                  {showLow52 && row.low_52w !== null && row.low_52w !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Prior 52W Low </span>
                      <span className="font-medium">{formatScreenerMetric(row.low_52w, "price")}</span>
                    </div>
                  )}
                </div>
                {showCatalyst && (
                  <div className="mt-1.5 text-[12px]">{renderCatalystCell(sym)}</div>
                )}
              </div>
            );
          })}

          {isFullGate && (
            <div className="absolute inset-0 backdrop-blur-sm bg-background/70 flex flex-col items-center justify-center gap-2 p-6 text-center rounded-lg">
              <div className="text-2xl">⚡</div>
              <div className="text-sm font-semibold text-foreground">
                {tab.label} — Pro Feature
              </div>
              <button
                onClick={() => navigate("/pro")}
                className="mt-1 bg-accent-blue text-white text-[13px] font-semibold px-5 py-2 rounded-md hover:opacity-90 transition-opacity duration-200"
              >
                Unlock with Pro access
              </button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Or go Unlimited for full access.
              </p>
            </div>
          )}
        </div>
      )}

      {!loading && hasVerifiedRows && sortedRows.length === 0 && filters.hasActive && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No rows match the current filters.
        </div>
      )}

      {!loading &&
        hasVerifiedRows &&
        !isPro &&
        !isFullGate &&
        sortedRows.length > tab.freeRowLimit && (
          <div className="text-center pt-1">
            <button
              onClick={() => navigate("/pro")}
              className="text-[12px] font-semibold text-accent-blue hover:underline"
            >
              Unlock all {sortedRows.length} results with Pro access →
            </button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Or go Unlimited for full access.
            </p>
          </div>
        )}
    </div>
  );
}
