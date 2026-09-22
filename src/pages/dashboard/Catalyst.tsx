import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Radar, Search, X, Loader2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCatalystEvents,
  useCatalystUserState,
  useToggleCatalystSaved,
  useToggleCatalystReviewed,
  useCatalystLastSync,
} from "@/hooks/useCatalystEvents";
import { useCatalystHistoricalContext } from "@/hooks/useCatalystHistoricalContext";
import { CatalystEventRow } from "@/components/catalyst/CatalystEventRow";
import { CatalystDetailPanel } from "@/components/catalyst/CatalystDetailPanel";
import {
  type WorkflowFilter,
  isFuture,
  isRecent,
  makeComparator,
  normalizeSymbol,
} from "@/lib/catalyst/parsers";
import {
  watchlistCatalystCounts,
  watchlistCatalystEmptyMessage,
} from "@/lib/catalyst/presentation";
import { liveEventCategory } from "@/lib/catalyst/catalyst-event-visuals";
import {
  CATALYST_CATEGORY_FILTERS,
  CATALYST_CATEGORY_FILTER_LABEL,
  CATALYST_RECENCY_FILTERS,
  CATALYST_RECENCY_FILTER_LABEL,
  matchesCatalystCategoryFilter,
  matchesCatalystRecencyFilter,
  type CatalystCategoryFilter,
  type CatalystRecencyFilter,
} from "@/lib/catalyst/catalyst-filters";
import { buildCatalystHistoricalSummary } from "@/lib/catalyst/catalyst-historical-facts";
import type { CatalystEvent } from "@/types/catalyst";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

export const WATCHLIST_SUMMARY_LABEL = "Watchlist Catalysts";

export const WORKFLOW_LABEL: Record<WorkflowFilter, string> = {
  all: "All Events",
  watchlist: "Watchlist Catalysts",
  saved: "Saved",
  reviewed: "Reviewed",
};

export const CATALYST_HEADER_TITLE = "Catalyst Intelligence";
export const CATALYST_HEADER_SUBTITLE =
  "Verified market-moving events, filings, earnings, and news tied to active stocks.";

function formatLastSync(iso: string | null | undefined): string {
  if (!iso) return "No successful sync yet";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "No successful sync yet";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function sessionContextLabel(nowMs: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date(nowMs));
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  if (weekday === "Sat" || weekday === "Sun") return "Market closed";
  const minutesOfDay = hour * 60 + minute;
  if (minutesOfDay < 4 * 60) return "Overnight";
  if (minutesOfDay < 9 * 60 + 30) return "Pre-market";
  if (minutesOfDay < 16 * 60) return "Regular hours";
  if (minutesOfDay < 20 * 60) return "After hours";
  return "Market closed";
}

export default function Catalyst() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawSymbol = searchParams.get("symbol");
  const activeSymbol = normalizeSymbol(rawSymbol);
  const { user } = useAuth();
  const { toast } = useToast();

  // Strip invalid ?symbol= values from the URL.
  useEffect(() => {
    if (rawSymbol && !activeSymbol) {
      const next = new URLSearchParams(searchParams);
      next.delete("symbol");
      setSearchParams(next, { replace: true });
    }
  }, [rawSymbol, activeSymbol, searchParams, setSearchParams]);

  const [categoryFilter, setCategoryFilter] = useState<CatalystCategoryFilter>("all");
  const [recencyFilter, setRecencyFilter] = useState<CatalystRecencyFilter>("any");
  const [workflow, setWorkflow] = useState<WorkflowFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const { data: rawEvents, isLoading, error } = useCatalystEvents({
    symbol: activeSymbol,
    recentDays: 3,
    upcomingDays: 30,
    limit: 500,
  });
  const { data: userState } = useCatalystUserState();
  const { data: lastSync } = useCatalystLastSync();

  const toggleSaved = useToggleCatalystSaved();
  const toggleReviewed = useToggleCatalystReviewed();

  const [watchlistSymbols, setWatchlistSymbols] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!user) { setWatchlistSymbols(new Set()); return; }
    let cancelled = false;
    supabase
      .from("watchlists")
      .select("symbol")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        const s = new Set<string>();
        for (const row of data ?? []) {
          const sym = normalizeSymbol((row as { symbol?: string }).symbol);
          if (sym) s.add(sym);
        }
        setWatchlistSymbols(s);
      });
    return () => { cancelled = true; };
  }, [user]);

  const savedByEvent = useMemo(() => {
    const m = new Set<string>();
    for (const r of userState ?? []) if (r.saved_at) m.add(r.event_id);
    return m;
  }, [userState]);

  const reviewedByEvent = useMemo(() => {
    const m = new Set<string>();
    for (const r of userState ?? []) if (r.reviewed_at) m.add(r.event_id);
    return m;
  }, [userState]);

  const events = useMemo<CatalystEvent[]>(() => rawEvents ?? [], [rawEvents]);
  const nowMs = Date.now();

  // Live feed first: category / workflow / symbol filters never wait on history.
  const feedEvents = useMemo(() => {
    const searchFilter = normalizeSymbol(searchInput.trim().toUpperCase());
    const filtered = events.filter((e) => {
      if (!matchesCatalystCategoryFilter(categoryFilter, liveEventCategory(e.event_type))) return false;
      if (workflow === "watchlist" && !watchlistSymbols.has(e.symbol)) return false;
      if (workflow === "saved" && !savedByEvent.has(e.id)) return false;
      if (workflow === "reviewed" && !reviewedByEvent.has(e.id)) return false;
      if (searchFilter && e.symbol !== searchFilter) return false;
      return true;
    });
    return filtered.sort(makeComparator(false, nowMs));
  }, [events, categoryFilter, workflow, watchlistSymbols, savedByEvent, reviewedByEvent, searchInput, nowMs]);

  // Historical context is enriched asynchronously and fails soft.
  const enrichSymbols = useMemo(() => {
    const seen: string[] = [];
    for (const e of feedEvents) {
      if (!seen.includes(e.symbol)) seen.push(e.symbol);
      if (seen.length >= 24) break;
    }
    return seen;
  }, [feedEvents]);

  const { contexts, loadingSymbols } = useCatalystHistoricalContext(enrichSymbols);

  const summaryFor = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof buildCatalystHistoricalSummary>>();
    return (symbol: string) => {
      const cached = cache.get(symbol);
      if (cached) return cached;
      const context: RepeatMoverContext | null = contexts[symbol] ?? null;
      const built = buildCatalystHistoricalSummary(context);
      cache.set(symbol, built);
      return built;
    };
  }, [contexts]);

  const visibleEvents = useMemo(
    () =>
      feedEvents.filter((e) =>
        matchesCatalystRecencyFilter({
          filter: recencyFilter,
          publishedAtIso: e.published_at,
          eventDate: e.event_date ?? null,
          hasHistoricalContext: summaryFor(e.symbol).available,
          nowMs,
        }),
      ),
    [feedEvents, recencyFilter, summaryFor, nowMs],
  );

  const summary = useMemo(() => {
    const upcomingEarnings = events.filter(
      (e) => e.event_type === "earnings" && isFuture(e, nowMs),
    ).length;
    const recentCompany = events.filter(
      (e) => e.event_type !== "earnings" && isRecent(e, nowMs, 72),
    ).length;
    const watchlistCatalysts = watchlistCatalystCounts(events, watchlistSymbols);
    const last24 = events.filter((e) => isRecent(e, nowMs, 24)).length;
    return { upcomingEarnings, recentCompany, watchlistCatalysts, last24 };
  }, [events, watchlistSymbols, nowMs]);

  const clearSymbolFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("symbol");
    setSearchParams(next, { replace: true });
  };

  const handleToggleSaved = (event: CatalystEvent, nextSaved: boolean) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to save catalyst events." });
      return;
    }
    toggleSaved.mutate({ eventId: event.id, nextSaved });
  };

  const handleToggleReviewed = (event: CatalystEvent, nextReviewed: boolean) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to mark events reviewed." });
      return;
    }
    toggleReviewed.mutate({ eventId: event.id, nextReviewed });
  };

  const selectedEvent = useMemo(
    () => visibleEvents.find((e) => e.id === selectedEventId) ?? null,
    [visibleEvents, selectedEventId],
  );

  return (
    <div className="space-y-4 p-4 sm:p-6" data-testid="catalyst-page">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-accent-blue" />
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {CATALYST_HEADER_TITLE}
            </h1>
          </div>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
            {CATALYST_HEADER_SUBTITLE}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Updated {formatLastSync(lastSync ?? null)}
          </span>
          <span className="rounded-full border border-border px-2 py-1">
            {sessionContextLabel(nowMs)}
          </span>
        </div>
      </div>

      {activeSymbol && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
          <div className="text-[13px]">
            Showing events for <span className="font-semibold">{activeSymbol}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={clearSymbolFilter} className="gap-1">
            <X className="h-3.5 w-3.5" /> Clear Filter
          </Button>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <SummaryCard label="Upcoming Earnings" value={summary.upcomingEarnings} />
        <SummaryCard label="Recent Company Events" value={summary.recentCompany} />
        <SummaryCard
          label={WATCHLIST_SUMMARY_LABEL}
          value={summary.watchlistCatalysts.events}
          sublabel={`${summary.watchlistCatalysts.events} events · ${summary.watchlistCatalysts.stocks} stocks`}
        />
        <SummaryCard label="Reported in Last 24h" value={summary.last24} />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <FilterRow>
          {CATALYST_CATEGORY_FILTERS.map((f) => (
            <FilterChip key={f} active={categoryFilter === f} onClick={() => setCategoryFilter(f)}>
              {CATALYST_CATEGORY_FILTER_LABEL[f]}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow>
          {CATALYST_RECENCY_FILTERS.map((f) => (
            <FilterChip key={f} active={recencyFilter === f} onClick={() => setRecencyFilter(f)}>
              {CATALYST_RECENCY_FILTER_LABEL[f]}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow>
          {(["all", "watchlist", "saved", "reviewed"] as WorkflowFilter[]).map((w) => (
            <FilterChip key={w} active={workflow === w} onClick={() => setWorkflow(w)}>
              {WORKFLOW_LABEL[w]}
            </FilterChip>
          ))}
          <div className="ml-auto flex min-w-[160px] items-center gap-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Filter by symbol"
              className="h-8 text-[12px]"
              aria-label="Filter events by symbol"
            />
          </div>
        </FilterRow>
      </div>

      {/* Feed */}
      {isLoading && (
        <Card className="flex items-center justify-center p-6 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading catalyst events…
        </Card>
      )}

      {!isLoading && error && (
        <Card className="flex items-center gap-2 p-6 text-[13px] text-amber-600">
          <AlertTriangle className="h-4 w-4" />
          Unable to load catalyst events right now. Please try again shortly.
        </Card>
      )}

      {!isLoading && !error && visibleEvents.length === 0 && (
        <Card className="space-y-1 p-8 text-center">
          <div className="text-sm font-semibold text-foreground">
            {emptyMessage(activeSymbol, workflow, watchlistSymbols.size)}
          </div>
          <div className="text-[12px] text-muted-foreground">
            Try a different category, time, or workflow filter.
          </div>
        </Card>
      )}

      {!isLoading && !error && visibleEvents.length > 0 && (
        <div className="grid gap-2">
          {visibleEvents.map((e) => (
            <CatalystEventRow
              key={e.id}
              event={e}
              summary={summaryFor(e.symbol)}
              historyLoading={loadingSymbols.has(e.symbol)}
              isSaved={savedByEvent.has(e.id)}
              isReviewed={reviewedByEvent.has(e.id)}
              onOpen={() => setSelectedEventId(e.id)}
              onToggleSaved={() => handleToggleSaved(e, !savedByEvent.has(e.id))}
              onToggleReviewed={() => handleToggleReviewed(e, !reviewedByEvent.has(e.id))}
              disabled={toggleSaved.isPending || toggleReviewed.isPending}
              nowMs={nowMs}
            />
          ))}
        </div>
      )}

      <CatalystDetailPanel
        event={selectedEvent}
        summary={buildCatalystHistoricalSummary(
          selectedEvent ? contexts[selectedEvent.symbol] ?? null : null,
        )}
        historyLoading={selectedEvent ? loadingSymbols.has(selectedEvent.symbol) : false}
        open={selectedEvent !== null}
        onOpenChange={(open) => { if (!open) setSelectedEventId(null); }}
        nowMs={nowMs}
      />
    </div>
  );
}

function SummaryCard({ label, value, sublabel }: { label: string; value: number; sublabel?: string }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</div>
      {sublabel && <div className="mt-1 text-[11px] text-muted-foreground">{sublabel}</div>}
    </Card>
  );
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-1">
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12px] transition-colors",
        active
          ? "border-accent-blue bg-accent-blue text-white"
          : "border-border bg-background text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function emptyMessage(
  symbol: string | null,
  workflow: WorkflowFilter,
  watchlistSize: number,
): string {
  if (symbol) return `No verified catalysts yet for ${symbol}.`;
  if (workflow === "saved") return "No saved Catalyst events yet.";
  if (workflow === "watchlist") return watchlistCatalystEmptyMessage(watchlistSize);
  return "No verified catalysts yet";
}
