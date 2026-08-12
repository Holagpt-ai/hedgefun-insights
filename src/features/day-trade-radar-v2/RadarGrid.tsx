import { Link } from "react-router-dom";
import { Plus, Check, Loader2, Newspaper, Sparkles, BookOpen } from "lucide-react";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { useCatalystEnrichmentForSymbols } from "@/hooks/useCatalystEnrichmentForSymbols";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";
import { EVENT_TYPE_LABEL, normalizeSymbol } from "@/lib/catalyst/parsers";
import { isRadarCapabilityEnabled } from "./radar-capabilities";
import {
  formatHodDistance,
  formatRadarDayRange,
  formatRadarMultiplier,
  formatRadarPercent,
  formatRadarPrice,
  formatRadarVolume,
  isRadarRowAccessible,
  moveClass,
  volumeRatioClass,
} from "./radar-metrics";
import type { RadarRankedRow } from "./types";
import { useMemo } from "react";

interface RadarGridProps {
  rows: RadarRankedRow[];
  selectedSymbol: string | null;
  isPro: boolean;
  freeRowLimit: number;
  onSelect: (row: RadarRankedRow) => void;
}

function CatalystCell({
  symbol,
  pending,
  error,
  entry,
}: {
  symbol: string;
  pending: boolean;
  error: boolean;
  entry: { event: { title?: string | null; event_type: string }; kind: string } | undefined;
}) {
  if (pending) {
    return <span className="text-muted-foreground text-xs">Catalyst check pending</span>;
  }
  if (error) {
    return <span className="text-muted-foreground text-xs">Catalyst unavailable</span>;
  }
  if (!entry) {
    return <span className="text-muted-foreground text-xs">No confirmed catalyst</span>;
  }
  // PR classification not verified in current catalyst types — never invent "PR".
  const label =
    EVENT_TYPE_LABEL[entry.event.event_type as keyof typeof EVENT_TYPE_LABEL] ??
    "Catalyst";
  const href =
    catalystSymbolHref(symbol) ??
    `/dashboard/catalyst?symbol=${encodeURIComponent(symbol)}`;
  return (
    <Link
      to={href}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex flex-col items-start gap-0.5 max-w-[180px] hover:underline"
      title={entry.event.title ?? label}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {isRadarCapabilityEnabled("pressReleaseClassification") ? "PR" : "Catalyst"} · {label}
      </span>
      <span className="text-[12px] text-foreground truncate max-w-full">
        {entry.event.title ?? label}
      </span>
    </Link>
  );
}

export function RadarGrid({
  rows,
  selectedSymbol,
  isPro,
  freeRowLimit,
  onSelect,
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

  const catalystCheckPending =
    symbols.length > 0 && (catalystPending || (catalystFetching && !catalystMap));

  return (
    <div className="relative rounded-lg border border-border overflow-hidden bg-card hidden md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50">
            <tr>
              {[
                "#",
                "Symbol",
                "Company",
                "Signal",
                "Last",
                "Move",
                "Day Range",
                "HOD Dist",
                "Volume",
                "Prior Day Vol",
                "Vol / Prior Day",
                "PR / Catalyst",
                "Actions",
              ].map((label) => (
                <th
                  key={label}
                  className={`px-2.5 py-2.5 min-h-[44px] font-semibold text-[11px] uppercase tracking-wide text-muted-foreground ${
                    ["#", "Symbol", "Company", "Signal", "PR / Catalyst", "Actions"].includes(label)
                      ? "text-left"
                      : "text-right"
                  }`}
                >
                  {label}
                </th>
              ))}
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
              const entry = catalystMap?.get(sym);

              return (
                <tr
                  key={`${row.tab_id}-${row.symbol}`}
                  onClick={() => {
                    if (accessible) onSelect(row);
                  }}
                  className={`border-t border-border transition-colors ${
                    !accessible
                      ? "blur-sm select-none pointer-events-none"
                      : "cursor-pointer hover:bg-muted/40"
                  } ${selected ? "bg-accent-blue/10" : ""} ${
                    isLeader && accessible ? "bg-amber-500/5" : ""
                  }`}
                >
                  <td className="px-2.5 py-2.5 tabular-nums font-semibold text-muted-foreground">
                    #{row.rank}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <Link
                      to={`/stocks/${sym}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-semibold text-accent-blue hover:underline"
                    >
                      {sym}
                    </Link>
                  </td>
                  <td className="px-2.5 py-2.5 max-w-[140px] truncate text-muted-foreground">
                    {company}
                  </td>
                  <td className="px-2.5 py-2.5">
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wide ${
                        row.signal === "TOP LEADER"
                          ? "text-amber-700 dark:text-amber-400"
                          : row.signal === "STALE" || row.signal === "INACTIVE"
                            ? "text-muted-foreground"
                            : "text-foreground"
                      }`}
                    >
                      {row.signal}
                    </span>
                  </td>
                  <td className="px-2.5 py-2.5 text-right tabular-nums">
                    {formatRadarPrice(row.price)}
                  </td>
                  <td
                    className={`px-2.5 py-2.5 text-right tabular-nums ${moveClass(row.change_percent)}`}
                  >
                    {formatRadarPercent(row.change_percent)}
                  </td>
                  <td className="px-2.5 py-2.5 text-right tabular-nums whitespace-nowrap">
                    {formatRadarDayRange(row.day_low, row.day_high)}
                  </td>
                  <td className="px-2.5 py-2.5 text-right tabular-nums">
                    {formatHodDistance(row.hod_distance_percent)}
                  </td>
                  <td className="px-2.5 py-2.5 text-right tabular-nums font-medium">
                    {formatRadarVolume(row.volume)}
                  </td>
                  <td className="px-2.5 py-2.5 text-right tabular-nums">
                    {formatRadarVolume(row.prior_session_volume)}
                  </td>
                  <td
                    className={`px-2.5 py-2.5 text-right tabular-nums ${volumeRatioClass(row.volume_ratio_prior_session)}`}
                  >
                    {formatRadarMultiplier(row.volume_ratio_prior_session)}
                  </td>
                  <td className="px-2.5 py-2.5">
                    {accessible ? (
                      <CatalystCell
                        symbol={sym}
                        pending={catalystCheckPending}
                        error={!!catalystError}
                        entry={entry}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-2.5 py-2.5">
                    {accessible && (
                      <div className="inline-flex items-center gap-0.5">
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
                        <Link
                          to={`/dashboard/ai?symbol=${encodeURIComponent(sym)}`}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Ask AI Analyst about ${sym}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Sparkles className="h-4 w-4" />
                        </Link>
                        <Link
                          to={`/dashboard/journal?symbol=${encodeURIComponent(sym)}`}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Open journal for ${sym}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <BookOpen className="h-4 w-4" />
                        </Link>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
