import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Check, Loader2 } from "lucide-react";
import { ScreenerTab, ColumnFormat } from "@/config/screener-tabs.config";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";

interface ScreenerTableProps {
  tab: ScreenerTab;
  isPro: boolean;
  liveRows?: any[];
  loading?: boolean;
  lastUpdated?: string | null;
  error?: string | null;
}

function formatCell(value: string | number, format: ColumnFormat): string {
  if (value === null || value === undefined) return "—";
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

function formatUpdatedAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffMs = Date.now() - then;
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function ScreenerTable({
  tab,
  isPro,
  liveRows,
  loading = false,
  lastUpdated,
  error,
}: ScreenerTableProps) {
  const navigate = useNavigate();
  const { add: addToWatchlist, isAdded, pendingSymbol } = useAddToWatchlist();
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const hasLive = !!liveRows && liveRows.length > 0;
  const usingFallback = !hasLive && tab.rows.length > 0;
  const hasNothing = !hasLive && tab.rows.length === 0;

  const handleSortClick = (key: string) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "desc" };
      if (prev.direction === "desc") return { key, direction: "asc" };
      return null;
    });
  };

  const sortedRows = useMemo(() => {
    const baseRows = hasLive ? (liveRows as any[]) : tab.rows;
    if (!sort) return baseRows;
    const col = tab.columns.find((c) => c.key === sort.key);
    if (!col) return baseRows;
    const dir = sort.direction === "asc" ? 1 : -1;
    const isText = col.format === "text";
    return [...baseRows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const aNull = av === null || av === undefined || av === "";
      const bNull = bv === null || bv === undefined || bv === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;
      if (isText) return String(av).localeCompare(String(bv)) * dir;
      return (Number(av) - Number(bv)) * dir;
    });
  }, [sort, tab.rows, tab.columns, liveRows, hasLive]);

  const isFullGate = !isPro && tab.freeRowLimit === 0;
  const visibleCount = isPro ? sortedRows.length : tab.freeRowLimit;

  const updatedAgo = formatUpdatedAgo(lastUpdated);

  return (
    <div className="space-y-3">
      {/* Criteria pills + data status badge */}
      <div className="flex flex-wrap items-center gap-2">
        {tab.criteria.map((c) => (
          <span
            key={c}
            className="text-[11px] font-medium px-2 py-1 rounded-md bg-muted text-muted-foreground"
          >
            {c}
          </span>
        ))}

        {/* Status badge — wraps to its own line on narrow widths */}
        <div className="w-full sm:w-auto sm:ml-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold uppercase tracking-wide">
          {hasLive && (
            <>
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Market feed · delayed
              </span>
              {updatedAgo && (
                <span className="normal-case font-normal text-muted-foreground">
                  · Updated {updatedAgo}
                </span>
              )}
            </>
          )}
          {usingFallback && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Sample data
            </span>
          )}
        </div>
      </div>

      {usingFallback && (
        <p className="text-[12px] text-muted-foreground">
          Live rows are not available for this screener yet — showing preview data.
        </p>
      )}

      {error && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
          Unable to load live screener data. Showing preview rows if available.
        </div>
      )}

      {loading && (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-8 rounded bg-muted/50 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && hasNothing && (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <div className="text-sm font-semibold text-foreground">
            No screener results available yet.
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Try another screener or check back later.
          </p>
        </div>
      )}

      {/* Table */}
      {!loading && !hasNothing && (
        <div className="relative rounded-lg border border-border overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/50">
                <tr>
                  {tab.columns.map((col) => {
                    const active = sort?.key === col.key;
                    const indicator = active ? (sort!.direction === "asc" ? " ▲" : " ▼") : "";
                    return (
                      <th
                        key={col.key}
                        onClick={() => handleSortClick(col.key)}
                        className={`px-3 py-3 min-h-[44px] font-semibold text-[11px] uppercase tracking-wide cursor-pointer select-none hover:text-foreground transition-colors ${
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
                      key={idx}
                      className={`border-t border-border ${
                        blurred ? "blur-sm select-none pointer-events-none" : ""
                      }`}
                    >
                      {tab.columns.map((col) => {
                        const raw = row[col.key];
                        const text = formatCell(raw, col.format);
                        const isSymbol = col.key === "symbol";
                        const isPct = col.format === "percent";
                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-3 tabular-nums ${
                              col.align === "right" ? "text-right" : "text-left"
                            } ${isPct ? percentClass(Number(raw)) : ""}`}
                          >
                            {isSymbol ? (
                              <div className="inline-flex items-center gap-1">
                                <Link
                                  to={`/stocks/${raw}`}
                                  className="inline-flex items-center min-h-[36px] font-semibold text-accent-blue hover:underline"
                                >
                                  {text}
                                </Link>
                                {hasLive && !blurred && (() => {
                                  const sym = String(raw).toUpperCase();
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
                                      aria-label={
                                        already
                                          ? `${sym} is in watchlist`
                                          : `Add ${sym} to watchlist`
                                      }
                                      title={
                                        already
                                          ? "In watchlist"
                                          : `Add ${sym} to watchlist`
                                      }
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
                                })()}
                              </div>
                            ) : (
                              text
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Full-table PRO gate overlay */}
          {isFullGate && (
            <div className="absolute inset-0 backdrop-blur-sm bg-background/70 flex flex-col items-center justify-center gap-2 p-6 text-center">
              <div className="text-2xl">⚡</div>
              <div className="text-sm font-semibold text-foreground">
                {tab.label} — PRO Feature
              </div>
              <div className="text-[12px] text-muted-foreground max-w-sm">
                {tab.description}
              </div>
              <button
                onClick={() => navigate("/pro")}
                className="mt-1 bg-accent-blue text-white text-[13px] font-semibold px-5 py-2 rounded-md hover:opacity-90 transition-opacity duration-200"
              >
                Unlock PRO — $5/month
              </button>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Or unlock everything with Unlimited for just $10/month.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Partial gate prompt */}
      {!loading && !hasNothing && !isPro && !isFullGate && sortedRows.length > tab.freeRowLimit && (
        <div className="text-center pt-1">
          <button
            onClick={() => navigate("/pro")}
            className="text-[12px] font-semibold text-accent-blue hover:underline"
          >
            Unlock all {sortedRows.length} results with PRO — $5/month →
          </button>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Or unlock everything with Unlimited for just $10/month.
          </p>
        </div>
      )}
    </div>
  );
}
