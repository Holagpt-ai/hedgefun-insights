import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Radar, Search, X, Loader2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCatalystEvents,
  useCatalystUserState,
  useToggleCatalystSaved,
  useToggleCatalystReviewed,
  useCatalystLastSync,
} from "@/hooks/useCatalystEvents";
import { CatalystEventCard } from "@/components/catalyst/CatalystEventCard";
import {
  EVENT_TYPE_LABEL,
  EVENT_TYPE_ORDER,
  HORIZON_LABEL,
  type HorizonFilter,
  type WorkflowFilter,
  isFuture,
  isRecent,
  isWithinHorizon,
  makeComparator,
  normalizeSymbol,
} from "@/lib/catalyst/parsers";
import type { CatalystEvent, CatalystEventType } from "@/types/catalyst";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

type TypeFilter = "all" | CatalystEventType;

const HORIZONS: HorizonFilter[] = ["today", "next_7_days", "next_30_days", "recent_72h"];

const WORKFLOW_LABEL: Record<WorkflowFilter, string> = {
  all: "All Events",
  watchlist: "My Watchlist",
  saved: "Saved",
  reviewed: "Reviewed",
};

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

  const [horizon, setHorizon] = useState<HorizonFilter>("next_7_days");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [workflow, setWorkflow] = useState<WorkflowFilter>("all");
  const [searchInput, setSearchInput] = useState("");

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

  // User's watchlist symbols for the workflow filter.
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

  const filteredEvents = useMemo(() => {
    const trimmedSearch = searchInput.trim().toUpperCase();
    const searchFilter = normalizeSymbol(trimmedSearch);
    return events.filter((e) => {
      // Horizon: matches window OR (for scheduled buckets) is any future event
      // within our loaded set; recent_72h only shows recently reported.
      if (!isWithinHorizon(e, horizon, nowMs)) return false;
      if (typeFilter !== "all" && e.event_type !== typeFilter) return false;
      if (workflow === "watchlist" && !watchlistSymbols.has(e.symbol)) return false;
      if (workflow === "saved" && !savedByEvent.has(e.id)) return false;
      if (workflow === "reviewed" && !reviewedByEvent.has(e.id)) return false;
      if (searchFilter && e.symbol !== searchFilter) return false;
      return true;
    });
  }, [events, horizon, typeFilter, workflow, watchlistSymbols, savedByEvent, reviewedByEvent, searchInput, nowMs]);

  const scheduledBucket = horizon !== "recent_72h";
  const sortedEvents = useMemo(() => {
    const cmp = makeComparator(scheduledBucket, nowMs);
    return [...filteredEvents].sort(cmp);
  }, [filteredEvents, scheduledBucket, nowMs]);

  const summary = useMemo(() => {
    const upcomingEarnings = events.filter(
      (e) => e.event_type === "earnings" && isFuture(e, nowMs),
    ).length;
    const recentCompany = events.filter(
      (e) => e.event_type !== "earnings" && isRecent(e, nowMs, 72),
    ).length;
    const myWatchlist = events.filter((e) => watchlistSymbols.has(e.symbol)).length;
    const last24 = events.filter((e) => isRecent(e, nowMs, 24)).length;
    return { upcomingEarnings, recentCompany, myWatchlist, last24 };
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

  return (
    <div className="p-4 sm:p-6 space-y-5" data-testid="catalyst-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Radar className="h-5 w-5 text-accent-blue" />
            <h1 className="text-2xl font-semibold tracking-tight">Catalyst</h1>
          </div>
          <p className="mt-1 text-[14px] text-muted-foreground max-w-2xl">
            Provider-reported company events and scheduled earnings across the Stocksist workflow.
          </p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Provider-reported events · Verify source details before trading
          </p>
        </div>
        <div className="text-[11px] text-muted-foreground text-right">
          <div>Last successful data:</div>
          <div className="font-medium tabular-nums text-foreground/80">
            {formatLastSync(lastSync ?? null)}
          </div>
        </div>
      </div>

      {activeSymbol && (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 flex items-center justify-between gap-3">
          <div className="text-[13px]">
            Showing events for <span className="font-semibold">{activeSymbol}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={clearSymbolFilter} className="gap-1">
            <X className="h-3.5 w-3.5" /> Clear Filter
          </Button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Upcoming Earnings" value={summary.upcomingEarnings} />
        <SummaryCard label="Recent Company Events" value={summary.recentCompany} />
        <SummaryCard label="My Watchlist Events" value={summary.myWatchlist} />
        <SummaryCard label="Reported in Last 24h" value={summary.last24} />
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <FilterRow>
          {HORIZONS.map((h) => (
            <FilterChip key={h} active={horizon === h} onClick={() => setHorizon(h)}>
              {HORIZON_LABEL[h]}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow>
          <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
            All
          </FilterChip>
          {EVENT_TYPE_ORDER.map((t) => (
            <FilterChip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
              {EVENT_TYPE_LABEL[t]}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow>
          {(["all", "watchlist", "saved", "reviewed"] as WorkflowFilter[]).map((w) => (
            <FilterChip key={w} active={workflow === w} onClick={() => setWorkflow(w)}>
              {WORKFLOW_LABEL[w]}
            </FilterChip>
          ))}
          <div className="ml-auto flex items-center gap-1.5 min-w-[180px]">
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

      {/* Body */}
      {isLoading && (
        <Card className="p-6 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading catalyst events…
        </Card>
      )}

      {!isLoading && error && (
        <Card className="p-6 flex items-center gap-2 text-amber-600 text-[13px]">
          <AlertTriangle className="h-4 w-4" />
          Unable to load catalyst events right now. Please try again shortly.
        </Card>
      )}

      {!isLoading && !error && sortedEvents.length === 0 && (
        <Card className="p-8 text-center space-y-1">
          <div className="text-sm font-semibold text-foreground">
            {emptyMessage(activeSymbol, workflow, horizon)}
          </div>
          <div className="text-[12px] text-muted-foreground">
            Try a different horizon, type, or workflow filter.
          </div>
        </Card>
      )}

      {!isLoading && !error && sortedEvents.length > 0 && (
        <div className="grid gap-3">
          {sortedEvents.map((e) => (
            <CatalystEventCard
              key={e.id}
              event={e}
              isSaved={savedByEvent.has(e.id)}
              isReviewed={reviewedByEvent.has(e.id)}
              onToggleSaved={() => handleToggleSaved(e, !savedByEvent.has(e.id))}
              onToggleReviewed={() => handleToggleReviewed(e, !reviewedByEvent.has(e.id))}
              disabled={toggleSaved.isPending || toggleReviewed.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
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
        "shrink-0 whitespace-nowrap text-[12px] px-3 py-1.5 rounded-full border transition-colors",
        active
          ? "bg-accent-blue text-white border-accent-blue"
          : "bg-background text-muted-foreground border-border hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function emptyMessage(
  symbol: string | null,
  workflow: WorkflowFilter,
  horizon: HorizonFilter,
): string {
  if (symbol) return `No recent catalyst found for ${symbol}.`;
  if (workflow === "saved") return "No saved Catalyst events yet.";
  if (workflow === "watchlist") return "No provider-reported catalysts match your watchlist.";
  if (horizon === "next_7_days" || horizon === "next_30_days" || horizon === "today") {
    return "No upcoming earnings found in this window.";
  }
  return "No provider-reported catalysts match these filters.";
}
