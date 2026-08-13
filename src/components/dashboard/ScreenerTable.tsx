import { useState, useMemo } from "react";
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

interface ScreenerTableProps {
  tab: ScreenerTab;
  isPro: boolean;
  rows?: ScreenerResultRow[];
  status?: ScreenerUiStatus;
}

function formatCell(value: string | number | null | undefined, format: ColumnFormat): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (format) {
    case "price":
      return `$${Number(value).toFixed(2)}`;
    case "percent": {
      const n = Number(value);
      const sign = n > 0 ? "+" : "";
      return `${sign}${n.toFixed(1)}%`;
    }
    case "multiplier":
      return `${Number(value).toFixed(1)}×`;
    case "volume":
    case "shares": {
      const n = Number(value);
      if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
      return String(n);
    }
    case "text":
    default:
      return String(value);
  }
}

function percentClass(value: number): string {
  if (value > 0) return "text-green-600";
  if (value < 0) return "text-red-600";
  return "text-foreground";
}

function isCompanyEmpty(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

export function ScreenerTable({
  tab,
  isPro,
  rows = [],
  status = "loading",
}: ScreenerTableProps) {
  const navigate = useNavigate();
  const { add: addToWatchlist, isAdded, pendingSymbol } = useAddToWatchlist();
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const loading = status === "loading";
  const showRows = status === "available" || status === "stale";
  const hasVerifiedRows = showRows && rows.length > 0;

  const handleSortClick = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "desc" };
      if (prev.direction === "desc") return { key, direction: "asc" };
      return null;
    });
  };

  const sortedRows = useMemo(() => {
    const baseRows = hasVerifiedRows ? rows : [];
    if (!sort) return baseRows;
    const col = tab.columns.find((c) => c.key === sort.key);
    if (!col) return baseRows;
    const dir = sort.direction === "asc" ? 1 : -1;
    const isText = col.format === "text";
    return [...baseRows].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sort.key];
      const bv = (b as unknown as Record<string, unknown>)[sort.key];
      const aNull = av === null || av === undefined || av === "";
      const bNull = bv === null || bv === undefined || bv === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (isText) return String(av).localeCompare(String(bv)) * dir;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [sort, tab.columns, rows, hasVerifiedRows]);

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
        className="inline-flex flex-col items-start gap-0.5 max-w-[220px] hover:underline"
        title={entry.event.title ?? label}
      >
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {kindLabel} · {label}
        </span>
        <span className="text-[12px] text-foreground truncate max-w-full">
          {entry.event.title ?? entry.event.company_name ?? sym}
        </span>
      </Link>
    );
  };

  const renderCellContent = (row: ScreenerResultRow, col: ScreenerColumn, blurred: boolean) => {
    const raw = (row as unknown as Record<string, unknown>)[col.key];
    const sym = normalizeSymbol(row.symbol) ?? String(row.symbol ?? "").toUpperCase();

    if (col.key === "symbol") {
      const showInlineActions = tab.columns.every((c) => c.key !== "actions");
      return (
        <div className="inline-flex items-center gap-1">
          <Link
            to={`/stocks/${raw}`}
            className="inline-flex items-center min-h-[36px] font-semibold text-accent-blue hover:underline"
          >
            {formatCell(raw as string, col.format)}
          </Link>
          {hasVerifiedRows && !blurred && showInlineActions && (
            <div className="inline-flex items-center gap-0.5">
              {renderWatchlistButton(sym)}
              {renderCatalystButton(sym)}
              {renderAiButton(sym)}
            </div>
          )}
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

    if (col.key === "volume_ratio_prior_session" && col.format === "multiplier") {
      return (
        <span className={volumeRatioBadgeClass(Number(raw))}>
          {formatCell(raw as number, col.format)}
        </span>
      );
    }

    return formatCell(raw as string | number | null | undefined, col.format);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {tab.criteria.map((c) => (
          <span
            key={c}
            className="text-[11px] font-medium px-2 py-1 rounded-md bg-muted text-muted-foreground"
          >
            {c}
          </span>
        ))}
      </div>

      {loading && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && status === "unavailable" && (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <div className="text-sm font-semibold text-foreground">
            {tab.id === "new_highs_lows"
              ? "New Highs / Lows is unavailable because a validated 52-week baseline could not be loaded. No securities are being inferred."
              : "Screener data is temporarily unavailable. No unverified rows are being shown."}
          </div>
        </div>
      )}

      {!loading && status === "initializing" && (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <div className="text-sm font-semibold text-foreground">
            New Highs / Lows is initializing a validated prior 52-week baseline. No securities are being inferred.
          </div>
        </div>
      )}

      {!loading && status === "empty" && (
        <div className="rounded-lg border border-border bg-card p-10 text-center">
          <div className="text-sm font-semibold text-foreground">
            No securities met this screener’s criteria in the latest validated generation.
          </div>
        </div>
      )}

      {!loading && hasVerifiedRows && (
        <div className="relative rounded-lg border border-border overflow-hidden bg-card hidden md:block min-w-0">
          <div className="min-w-0">
            <table className="w-full table-fixed text-[12px]">
              <thead className="bg-muted/50">
                <tr>
                  {tab.columns.map((col) => {
                    const active = sort?.key === col.key;
                    const indicator = active ? (sort!.direction === "asc" ? " ▲" : " ▼") : "";
                    return (
                      <th
                        key={col.key}
                        onClick={() => handleSortClick(col.key)}
                        className={`px-2 py-2 font-semibold text-[10px] uppercase tracking-wide cursor-pointer select-none hover:text-foreground transition-colors ${
                          active ? "text-foreground" : "text-muted-foreground"
                        } ${col.align === "right" ? "text-right" : "text-left"}`}
                      >
                        {col.label}
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
                      className={`border-t border-border ${
                        blurred ? "blur-sm select-none pointer-events-none" : ""
                      }`}
                    >
                      {tab.columns.map((col) => {
                        const raw = (row as unknown as Record<string, unknown>)[col.key];
                        const isPct = col.format === "percent";
                        return (
                          <td
                            key={col.key}
                            className={`px-2 py-2 tabular-nums ${
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
                {tab.description}
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
            return (
              <div
                key={`${row.tab_id}-${row.symbol}`}
                className={`rounded-lg border border-border bg-card p-3 ${
                  blurred ? "blur-sm select-none pointer-events-none" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      to={`/stocks/${sym}`}
                      className="font-semibold text-accent-blue hover:underline"
                    >
                      {sym}
                    </Link>
                    <div className="text-[12px] truncate">
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
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] tabular-nums">
                  {showEvent && (
                    <div>
                      <span className="text-muted-foreground">Event </span>
                      <span className="font-medium">{formatRangeEvent(row.range_event)}</span>
                    </div>
                  )}
                  {showPrice && row.price !== null && row.price !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Price </span>
                      <span className="font-medium">{formatCell(row.price, "price")}</span>
                    </div>
                  )}
                  {movementLabel &&
                    movementValue !== null &&
                    movementValue !== undefined && (
                      <div>
                        <span className="text-muted-foreground">{movementLabel} </span>
                        <span className={`font-medium ${percentClass(Number(movementValue))}`}>
                          {formatCell(movementValue, "percent")}
                        </span>
                      </div>
                    )}
                  {showVolume && row.volume !== null && row.volume !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Volume </span>
                      <span className="font-medium">{formatCell(row.volume, "volume")}</span>
                    </div>
                  )}
                  {showPriorVol &&
                    row.prior_session_volume !== null &&
                    row.prior_session_volume !== undefined && (
                      <div>
                        <span className="text-muted-foreground">Prior Vol </span>
                        <span className="font-medium">
                          {formatCell(row.prior_session_volume, "volume")}
                        </span>
                      </div>
                    )}
                  {showVolRatio &&
                    row.volume_ratio_prior_session !== null &&
                    row.volume_ratio_prior_session !== undefined && (
                      <div>
                        <span className="text-muted-foreground">Vol / Prior </span>
                        <span className={volumeRatioBadgeClass(Number(row.volume_ratio_prior_session))}>
                          {formatCell(row.volume_ratio_prior_session, "multiplier")}
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
                      <span className="font-medium">{formatCell(row.high_52w, "price")}</span>
                    </div>
                  )}
                  {showLow52 && row.low_52w !== null && row.low_52w !== undefined && (
                    <div>
                      <span className="text-muted-foreground">Prior 52W Low </span>
                      <span className="font-medium">{formatCell(row.low_52w, "price")}</span>
                    </div>
                  )}
                </div>
                {showCatalyst && (
                  <div className="mt-2 text-[12px]">{renderCatalystCell(sym)}</div>
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
