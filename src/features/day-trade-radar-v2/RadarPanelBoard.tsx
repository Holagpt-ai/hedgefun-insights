import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Newspaper, Plus, Check, Loader2, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { useCatalystEnrichmentForSymbols } from "@/hooks/useCatalystEnrichmentForSymbols";
import { useRadarFloatForSymbols } from "@/hooks/useRadarFloatForSymbols";
import { useRecentProviderNewsForSymbols } from "@/hooks/useRecentProviderNewsForSymbols";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import { formatScreenerRvol5m } from "@/lib/screeners/screener-metric-display";
import { TriggeredTimeCell } from "@/components/screener/TriggeredTimeCell";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import type { RadarNewsSymbolStatus, RecentProviderHeadline } from "@/lib/market-data/recent-news";
import { NO_VERIFIED_NEWS_COPY, resolveRadarNewsCellState } from "./radar-news-display";
import { HistoryCell } from "./HistoricalBehavior";
import { HintedMetric, ScannerMetricHint } from "./ScannerMetricHint";
import {
  HISTORY_HEADER,
  MOVE_BLANK,
  MOVE_HEADER,
  TODAY_VOL_BLANK,
  TODAY_VOL_HEADER,
  VOL_YDAY_HEADER,
  YDAY_VOL_BLANK,
  YDAY_VOL_HEADER,
} from "./scanner-metric-copy";
import { volumeVersusPriorSession } from "@/lib/screeners/session-move";
import {
  formatRadarMultiplier,
  formatRadarPercent,
  formatRadarPrice,
  formatRadarVolume,
  isRadarRowAccessible,
  moveClass,
  radarSignalClass,
} from "./radar-metrics";
import {
  PANEL_COLUMN_DEFS,
  PENNY_PRICE_BANDS,
  deskRowSignal,
  formatDeskHod,
  formatDeskVwap,
  formatVolumeSpeedCompact,
  formatVolumeSpeedExact,
  formatVolumeSpeedSpotlight,
  mapVolumeTrend,
  panelAgeLabel,
  panelMeta,
  panelTime,
  type PanelColumnId,
  type PanelFilterDraft,
  type PanelSortId,
  type PennyPriceBandId,
  type RadarPanelId,
} from "./multi-radar";
import type { RadarRankedRow } from "./types";

const SORTS: { id: PanelSortId; label: string }[] = [
  { id: "rank", label: "Radar rank" },
  { id: "volume_speed", label: "Volume Speed" },
  { id: "move", label: "Move" },
  { id: "time", label: "Time" },
];

const SELECTED_ROW_CLASS = "border-l-2 border-accent-blue bg-accent-blue-light";

const PANEL_HEADER_HINT: Partial<Record<PanelColumnId, string>> = {
  move: MOVE_HEADER,
  today_vol: TODAY_VOL_HEADER,
  yday_vol: YDAY_VOL_HEADER,
  vol_yday: VOL_YDAY_HEADER,
  history: HISTORY_HEADER,
};

function dash(value: string): string {
  return value === "Unavailable" ? "—" : value;
}

export function RadarPanelLeader({
  panel,
  row,
  selected,
  onSelect,
  onOpenDetails,
}: {
  panel: RadarPanelId;
  row: RadarRankedRow | null;
  selected: boolean;
  onSelect: (row: RadarRankedRow) => void;
  onOpenDetails: (row: RadarRankedRow) => void;
}) {
  const meta = panelMeta(panel);
  const symbols = row ? ([normalizeSymbol(row.symbol)].filter(Boolean) as string[]) : [];
  const { data: catalystMap } = useCatalystEnrichmentForSymbols(symbols);
  const floatState = useRadarFloatForSymbols(symbols);
  if (!row) return null;
  const speed = formatVolumeSpeedSpotlight(row.vol_velocity);
  const trend = mapVolumeTrend(row.volume_acceleration_pct);
    const signal = deskRowSignal(row, null);
  const floatShares = floatState.getFloat(row.symbol);
  const catalyst = catalystMap?.get(row.symbol);
  return (
    <div
      data-testid={`panel-leader-${panel}`}
      data-selected={selected ? "true" : undefined}
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-3 py-2 ${selected ? SELECTED_ROW_CLASS : ""}`}
    >
      <div className="min-w-[140px]">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{meta.leaderLabel}</div>
        <button type="button" className="text-lg font-semibold tracking-wide text-accent-blue" onClick={() => onSelect(row)}>
          {row.symbol}
        </button>
        {signal ? <div className="text-[10px] font-semibold uppercase text-foreground">{signal}</div> : null}
        <div className="flex gap-2 text-[13px] tabular-nums">
          <span>{formatRadarPrice(row.price)}</span>
          <HintedMetric
            text={formatRadarPercent(row.change_percent)}
            blankHint={MOVE_BLANK}
            className={moveClass(row.change_percent)}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 text-[11px] sm:grid-cols-3">
        {panel !== "breakouts" ? <Metric label="Float" value={floatShares === null ? "—" : dash(formatRadarVolume(floatShares))} /> : null}
        <Metric label="TODAY VOL" value={formatRadarVolume(row.volume)} />
        {panel !== "breakouts" ? <Metric label="YDAY VOL" value={formatRadarVolume(row.prior_session_volume)} /> : null}
        {panel !== "breakouts" ? (
          <Metric
            label="VOL/YDAY"
            value={formatRadarMultiplier(volumeVersusPriorSession(row.volume, row.prior_session_volume))}
          />
        ) : null}
        <Metric label="5m RVOL" value={formatScreenerRvol5m(row.rvol_5m)} />
        <Metric label="HOD" value={formatDeskHod(row)} />
        {panel === "breakouts" ? <Metric label="VWAP" value={formatDeskVwap(row)} /> : null}
        <Metric label="Catalyst" value={catalyst ? "Catalyst" : "No verified catalyst"} />
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">HISTORY</div>
          <HistoryCell context={row.historicalContext} />
        </div>
      </div>
      <div className="ml-auto flex items-stretch gap-3 rounded-md border border-border bg-muted/50 px-3 py-2" data-testid={`volume-speed-hero-${panel}`}>
        <div className="text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Volume Speed</div>
          <div className="font-mono text-2xl font-semibold tabular-nums leading-none">{speed ? speed.value : "—"}</div>
          <div className="text-[10px] text-muted-foreground">{speed ? speed.unit : "No recent tape"}</div>
        </div>
        <div className="flex items-center border-l border-border pl-3 text-sm font-semibold tracking-wide" data-testid={`volume-trend-hero-${panel}`}>
          {trend.label}
        </div>
      </div>
      <button type="button" className="h-8 rounded-md border border-border px-2 text-[12px] font-semibold" onClick={() => onOpenDetails(row)}>
        Details
      </button>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="tabular-nums text-foreground">{value}</div>
    </div>
  );
}

export function RadarPanelBoard({
  panel,
  rows,
  leader,
  layout,
  columns,
  sort,
  filters,
  priceBand,
  selectedSymbol,
  isPro,
  freeRowLimit,
  nowMs,
  onSelect,
  onOpenDetails,
  onSort,
  onFilters,
  onToggleColumn,
  onPriceBand,
}: {
  panel: RadarPanelId;
  rows: RadarRankedRow[];
  leader: RadarRankedRow | null;
  layout: "table" | "cards";
  columns: PanelColumnId[];
  sort: PanelSortId;
  filters: PanelFilterDraft;
  priceBand: PennyPriceBandId;
  selectedSymbol: string | null;
  isPro: boolean;
  freeRowLimit: number;
  nowMs: number;
  onSelect: (row: RadarRankedRow) => void;
  onOpenDetails: (row: RadarRankedRow) => void;
  onSort: (sort: PanelSortId) => void;
  onFilters: (filters: PanelFilterDraft) => void;
  onToggleColumn: (id: PanelColumnId) => void;
  onPriceBand: (band: PennyPriceBandId) => void;
}) {
  const meta = panelMeta(panel);
  const { add, isAdded, pendingSymbol } = useAddToWatchlist();
  const symbols = useMemo(() => {
    const out: string[] = [];
    for (const row of rows) {
      if (!isRadarRowAccessible(row.access_rank ?? row.rank, isPro, freeRowLimit)) continue;
      const symbol = normalizeSymbol(row.symbol);
      if (symbol) out.push(symbol);
    }
    return out;
  }, [rows, isPro, freeRowLimit]);
  const catalyst = useCatalystEnrichmentForSymbols(symbols);
  const floatState = useRadarFloatForSymbols(symbols);
  const news = useRecentProviderNewsForSymbols(symbols);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  return (
    <section data-testid={`radar-panel-${panel}`} className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2">
        <div className="mr-auto">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[13px] font-semibold tracking-wide">{meta.title}</h2>
            <span className="text-[11px] tabular-nums text-muted-foreground" data-testid={`panel-count-${panel}`}>
              {rows.length} matches
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">{meta.subtitle}</p>
        </div>
        {panel === "penny" ? (
          <label className="text-[11px] text-muted-foreground">
            <span className="sr-only">Penny price band</span>
            <select
              aria-label="Penny price band"
              className="h-7 rounded-md border border-border bg-background px-2 text-[11px]"
              value={priceBand}
              onChange={(event) => onPriceBand(event.target.value as PennyPriceBandId)}
            >
              {PENNY_PRICE_BANDS.map((band) => (
                <option key={band.id} value={band.id}>
                  {band.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="h-7 rounded-md border border-border px-2 text-[11px] font-semibold">Filters</button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-2" align="end">
            <FilterField label="Min price" value={filters.minPrice} onChange={(value) => onFilters({ ...filters, minPrice: value })} />
            <FilterField label="Max price" value={filters.maxPrice} onChange={(value) => onFilters({ ...filters, maxPrice: value })} />
            <FilterField label="Min volume" value={filters.minVolume} onChange={(value) => onFilters({ ...filters, minVolume: value })} />
            <FilterField label="Min move %" value={filters.minMovePct} onChange={(value) => onFilters({ ...filters, minMovePct: value })} />
          </PopoverContent>
        </Popover>
        <Popover open={columnsOpen} onOpenChange={setColumnsOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="h-7 rounded-md border border-border px-2 text-[11px] font-semibold">Columns</button>
          </PopoverTrigger>
          <PopoverContent className="max-h-72 w-52 space-y-1 overflow-y-auto" align="end">
            {PANEL_COLUMN_DEFS.map((column) => (
              <label key={column.id} className="flex items-center gap-2 text-[12px]">
                <Checkbox
                  checked={columns.includes(column.id)}
                  disabled={column.required}
                  onCheckedChange={() => onToggleColumn(column.id)}
                />
                {column.label}
              </label>
            ))}
          </PopoverContent>
        </Popover>
        <Popover open={sortOpen} onOpenChange={setSortOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="h-7 rounded-md border border-border px-2 text-[11px] font-semibold">Sort</button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="end">
            {SORTS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="block w-full rounded px-2 py-1 text-left text-[12px] hover:bg-muted"
                onClick={() => {
                  onSort(option.id);
                  setSortOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </header>
      <RadarPanelLeader
        panel={panel}
        row={leader}
        selected={leader !== null && selectedSymbol === leader.symbol}
        onSelect={onSelect}
        onOpenDetails={onOpenDetails}
      />
      {layout === "table" ? (
      <div className="overflow-x-auto" data-testid={`panel-table-${panel}`}>
        <table className="w-full text-[11.5px]">
          <thead className="bg-muted/60">
            <tr>
              {columns.map((id) => {
                const label = PANEL_COLUMN_DEFS.find((column) => column.id === id)?.label ?? id;
                const hint = PANEL_HEADER_HINT[id];
                return (
                  <th key={id} className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {hint ? <ScannerMetricHint label={hint}>{label}</ScannerMetricHint> : label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const accessible = isRadarRowAccessible(row.access_rank ?? row.rank, isPro, freeRowLimit);
              const selected = selectedSymbol === row.symbol;
              const time = panelTime(panel, row);
              const age = panelAgeLabel(time.iso, nowMs);
              return (
                <tr
                  key={row.symbol}
                  data-symbol={row.symbol}
                  onClick={() => {
                    if (accessible) onSelect(row);
                  }}
                  data-selected={selected ? "true" : undefined}
                  className={`cursor-pointer border-t border-border ${selected ? SELECTED_ROW_CLASS : "hover:bg-muted/40"} ${accessible ? "" : "pointer-events-none blur-sm"}`}
                >
                  {columns.map((id) => (
                    <td key={id} className="px-2 py-1 align-top">
                      {renderCell({
                        id,
                        row,
                        panel,
                        age,
                        timeIso: time.iso,
                        accessible,
                        floatShares: floatState.getFloat(row.symbol),
                        catalystPending: catalyst.isPending,
                        catalystEntry: catalyst.data?.get(row.symbol),
                        newsStatus: news.getStatus(row.symbol),
                        recent: news.getHeadline(row.symbol),
                        onOpenDetails,
                        add,
                        isAdded: isAdded(row.symbol),
                        pending: pendingSymbol === row.symbol,
                      })}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">No qualifying names.</p> : null}
      </div>
      ) : (
      <div className="space-y-2 p-2" data-testid={`panel-cards-${panel}`}>
        {rows.map((row) => (
          <MobilePanelCard
            key={row.symbol}
            panel={panel}
            row={row}
            nowMs={nowMs}
            selected={selectedSymbol === row.symbol}
            onSelect={onSelect}
          />
        ))}
      </div>
      )}
    </section>
  );
}

function FilterField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-[11px] text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-0.5 h-8 w-full rounded-md border border-border bg-background px-2 text-[12px] text-foreground"
      />
    </label>
  );
}

function renderCell(args: {
  id: PanelColumnId;
  row: RadarRankedRow;
  panel: RadarPanelId;
  age: string | null;
  timeIso: string | null;
  accessible: boolean;
  floatShares: number | null;
  catalystPending: boolean;
  catalystEntry: CatalystEnrichmentEntry | undefined;
  newsStatus: RadarNewsSymbolStatus;
  recent: RecentProviderHeadline | undefined;
  onOpenDetails: (row: RadarRankedRow) => void;
  add: (symbol: string) => void;
  isAdded: boolean;
  pending: boolean;
}): ReactNode {
  const { id, row } = args;
  if (id === "time") {
    return (
      <div>
        <TriggeredTimeCell triggeredAt={args.timeIso} title={args.timeIso ? "Panel entry" : "Time unavailable"} />
        {args.age ? <div className="text-[10px] font-semibold text-accent-blue">{args.age}</div> : null}
      </div>
    );
  }
  if (id === "rank") return <span className="tabular-nums font-semibold text-muted-foreground">{row.rank}</span>;
  if (id === "symbol") {
    const signal = deskRowSignal(row, args.age);
    return (
      <div>
        <Link to={`/stocks/${row.symbol}`} onClick={(event) => event.stopPropagation()} className="font-semibold text-accent-blue hover:underline">
          {row.symbol}
        </Link>
        {signal ? (
          <div className={`text-[10px] font-semibold uppercase ${radarSignalClass(row.signal)}`}>{signal}</div>
        ) : null}
      </div>
    );
  }
  if (id === "last") return <span className="tabular-nums">{formatRadarPrice(row.price)}</span>;
  if (id === "move") {
    return (
      <HintedMetric
        text={formatRadarPercent(row.change_percent)}
        blankHint={MOVE_BLANK}
        className={`tabular-nums ${moveClass(row.change_percent)}`}
      />
    );
  }
  if (id === "float") return <span className="tabular-nums">{args.floatShares === null ? "—" : dash(formatRadarVolume(args.floatShares))}</span>;
  if (id === "today_vol") {
    return (
      <HintedMetric
        text={formatRadarVolume(row.volume)}
        blankHint={TODAY_VOL_BLANK}
        className="tabular-nums"
      />
    );
  }
  if (id === "yday_vol") {
    return (
      <HintedMetric
        text={formatRadarVolume(row.prior_session_volume)}
        blankHint={YDAY_VOL_BLANK}
        className="tabular-nums"
      />
    );
  }
  if (id === "vol_yday") {
    return (
      <span className="tabular-nums">
        {formatRadarMultiplier(volumeVersusPriorSession(row.volume, row.prior_session_volume))}
      </span>
    );
  }
  if (id === "rvol_5m") return <span className="tabular-nums">{formatScreenerRvol5m(row.rvol_5m)}</span>;
  if (id === "volume_speed") {
    return (
      <span className="tabular-nums" title={formatVolumeSpeedExact(row.vol_velocity)}>
        {formatVolumeSpeedCompact(row.vol_velocity)}
      </span>
    );
  }
  if (id === "volume_trend") {
    const trend = mapVolumeTrend(row.volume_acceleration_pct);
    return <span title={trend.title}>{trend.label}</span>;
  }
  if (id === "hod") return <span className="tabular-nums">{formatDeskHod(row)}</span>;
  if (id === "vwap") return <span>{formatDeskVwap(row)}</span>;
  if (id === "history") return args.accessible ? <HistoryCell context={row.historicalContext} /> : "—";
  if (id === "catalyst") {
    if (!args.accessible) return "—";
    const display = resolveRadarNewsCellState({
      symbol: row.symbol,
      catalyst: args.catalystEntry,
      recent: args.recent,
      newsStatus: args.newsStatus,
      catalystPending: args.catalystPending && !args.catalystEntry,
      catalystUnavailable: false,
    });
    if (display.level === "none") return <span className="text-muted-foreground">{NO_VERIFIED_NEWS_COPY}</span>;
    if (display.level === "catalyst") return <span>{display.category}</span>;
    if (display.level === "recent") return <span>Company News</span>;
    return <span className="text-muted-foreground">—</span>;
  }
  if (id === "actions") {
    if (!args.accessible) return null;
    const encoded = encodeURIComponent(row.symbol);
    return (
      <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
        <button type="button" aria-label={`Details for ${row.symbol}`} className="text-[11px] font-semibold text-accent-blue" onClick={() => args.onOpenDetails(row)}>
          Details
        </button>
        <button
          type="button"
          aria-label={args.isAdded ? `${row.symbol} is in watchlist` : `Add ${row.symbol} to watchlist`}
          onClick={() => {
            if (!args.isAdded && !args.pending) args.add(row.symbol);
          }}
        >
          {args.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : args.isAdded ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
        <Link aria-label={`View catalysts for ${row.symbol}`} to={catalystSymbolHref(row.symbol) ?? `/dashboard/catalyst?symbol=${encoded}`}>
          <Newspaper className="h-3.5 w-3.5" />
        </Link>
        <Link aria-label={`Ask AI Analyst about ${row.symbol}`} to={`/dashboard/ai?symbol=${encoded}`}>
          <Sparkles className="h-3.5 w-3.5" />
        </Link>
        <Link aria-label={`Open journal for ${row.symbol}`} to={`/dashboard/journal?symbol=${encoded}`}>
          <BookOpen className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }
  return "—";
}

function MobilePanelCard({
  panel,
  row,
  nowMs,
  selected,
  onSelect,
}: {
  panel: RadarPanelId;
  row: RadarRankedRow;
  nowMs: number;
  selected: boolean;
  onSelect: (row: RadarRankedRow) => void;
}) {
  const time = panelTime(panel, row);
  const age = panelAgeLabel(time.iso, nowMs);
  const trend = mapVolumeTrend(row.volume_acceleration_pct);
  return (
    <button
      type="button"
      data-symbol={row.symbol}
      onClick={() => onSelect(row)}
      data-selected={selected ? "true" : undefined}
      className={`w-full rounded-md border border-border p-2 text-left ${selected ? SELECTED_ROW_CLASS : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <TriggeredTimeCell triggeredAt={time.iso} />
        {age ? <span className="text-[10px] font-semibold text-accent-blue">{age}</span> : null}
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="font-semibold text-accent-blue">{row.symbol}</span>
        <span className="tabular-nums">{formatRadarPrice(row.price)} <span className={moveClass(row.change_percent)}>{formatRadarPercent(row.change_percent)}</span></span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 text-[11px] text-muted-foreground">
        <span>TODAY VOL {formatRadarVolume(row.volume)}</span>
        <span>VOL/YDAY {formatRadarMultiplier(volumeVersusPriorSession(row.volume, row.prior_session_volume))}</span>
        <span>5m {formatScreenerRvol5m(row.rvol_5m)}</span>
        <span title={formatVolumeSpeedExact(row.vol_velocity)}>{formatVolumeSpeedCompact(row.vol_velocity)}</span>
        <span>{trend.label}</span>
        <span>{formatDeskHod(row)}</span>
      </div>
    </button>
  );
}
