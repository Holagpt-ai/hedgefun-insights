import { Link } from "react-router-dom";
import { BookOpen, Brain, Calendar, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RadarRepeatMoverFilterId } from "@/config/radar-repeat-movers.config";
import { applyRadarRepeatMoverFilter } from "@/lib/radar/build-radar-repeat-movers-view";
import type {
  RadarRepeatMoverCandidate,
  RadarRepeatMoversView as RadarRepeatMoversViewData,
} from "@/lib/radar/radar-repeat-movers-types";
import { touchWorkflowHandoff } from "@/lib/historical-workflow/workflow-symbol-routes";
import { formatRadarMultiplier, formatRadarPercent, formatRadarVolume, moveClass } from "./radar-metrics";

const FILTER_LABELS: Partial<Record<RadarRepeatMoverFilterId, string>> = {
  all: "All",
  recurring_movers: "Recurring Movers",
  similar_prior_episodes: "Similar Prior Episodes",
  adequate_or_robust_history: "Adequate/Robust History",
  limited_history: "Limited History",
};

const DISPLAYED_FILTERS: readonly RadarRepeatMoverFilterId[] = [
  "all",
  "recurring_movers",
  "similar_prior_episodes",
  "adequate_or_robust_history",
  "limited_history",
];

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

function CandidateBadges({ candidate }: { candidate: RadarRepeatMoverCandidate }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      <Badge className="h-5 rounded px-1.5 py-0 text-[10px] normal-case tracking-normal">
        Repeat Mover
      </Badge>
      {candidate.sampleSizeQuality && (
        <Badge variant="outline" className="h-5 rounded px-1.5 py-0 text-[10px] normal-case tracking-normal">
          {titleCase(candidate.sampleSizeQuality)} history
        </Badge>
      )}
      {candidate.profileFreshness === "STALE" && (
        <Badge variant="outline" className="h-5 rounded px-1.5 py-0 text-[10px] normal-case tracking-normal text-muted-foreground">
          Stale profile
        </Badge>
      )}
    </div>
  );
}

function CandidateFacts({ candidate }: { candidate: RadarRepeatMoverCandidate }) {
  const facts = candidate.displayFacts.lines.slice(0, 2);
  if (facts.length === 0) return null;
  return (
    <div className="space-y-0.5 text-[11px] text-muted-foreground">
      {facts.map((fact) => <div key={fact}>{fact}</div>)}
    </div>
  );
}

function WorkflowActions({ candidate }: { candidate: RadarRepeatMoverCandidate }) {
  const actions = [
    { label: "AI Analyst", href: candidate.workflowHandoffs.aiAnalyst, Icon: Brain },
    { label: "Catalyst", href: candidate.workflowHandoffs.catalyst, Icon: Calendar },
    { label: "Watchlist", href: candidate.workflowHandoffs.watchlist, Icon: Star },
    { label: "Journal", href: candidate.workflowHandoffs.journal, Icon: BookOpen },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {actions.map(({ label, href, Icon }) => (
        <Button key={label} asChild variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground">
          <Link
            to={href}
            onClick={() => touchWorkflowHandoff(candidate.symbol, "repeat_movers")}
            aria-label={`${label} for ${candidate.symbol}`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </Link>
        </Button>
      ))}
    </div>
  );
}

function CandidateMetrics({ candidate }: { candidate: RadarRepeatMoverCandidate }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] tabular-nums">
      <span className={moveClass(candidate.currentMovePct)}>{formatRadarPercent(candidate.currentMovePct)}</span>
      <span><span className="text-muted-foreground">Vol </span>{formatRadarVolume(candidate.volume)}</span>
      {candidate.rvol !== null && (
        <span><span className="text-muted-foreground">RVOL </span>{formatRadarMultiplier(candidate.rvol)}</span>
      )}
      {candidate.lifecycle && <span className="text-muted-foreground">{titleCase(candidate.lifecycle)}</span>}
    </div>
  );
}

interface RepeatMoversViewProps {
  view: RadarRepeatMoversViewData;
  activeFilter: RadarRepeatMoverFilterId;
  onFilterChange: (filter: RadarRepeatMoverFilterId) => void;
  onOpenDetails: (symbol: string) => void;
}

export function RepeatMoversView({ view, activeFilter, onFilterChange, onOpenDetails }: RepeatMoversViewProps) {
  const allowedFilters = DISPLAYED_FILTERS.filter((filter) => view.filtersAvailable.includes(filter));
  const candidates = applyRadarRepeatMoverFilter(view.candidates, activeFilter);

  return (
    <section className="min-w-0 space-y-2" data-testid="repeat-movers-view">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground">{view.summary.repeatMoverCount}</span> repeat movers
          {view.summary.limitedHistoryCount > 0 && <> · {view.summary.limitedHistoryCount} limited history</>}
        </div>
      </div>

      <div className="overflow-x-auto pb-1" aria-label="Repeat Movers filters">
        <div className="flex w-max min-w-full gap-1">
          {allowedFilters.map((filter) => (
            <Button
              key={filter}
              type="button"
              size="sm"
              variant={activeFilter === filter ? "secondary" : "ghost"}
              className="h-7 px-2.5 text-[11px]"
              aria-pressed={activeFilter === filter}
              onClick={() => onFilterChange(filter)}
            >
              {FILTER_LABELS[filter]}
            </Button>
          ))}
        </div>
      </div>

      {candidates.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          No repeat movers match this filter.
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-md border border-border bg-card md:block">
            <div className="grid grid-cols-[minmax(180px,1.1fr)_minmax(210px,1fr)_minmax(300px,1.4fr)] gap-3 border-b border-border bg-muted/40 px-3 py-2 text-[10px] font-semibold uppercase text-muted-foreground">
              <span>Candidate</span><span>Current</span><span>History & actions</span>
            </div>
            {candidates.map((candidate) => (
              <div key={candidate.symbol} className="grid grid-cols-[minmax(180px,1.1fr)_minmax(210px,1fr)_minmax(300px,1.4fr)] gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                <div className="min-w-0">
                  <Button type="button" variant="link" onClick={() => onOpenDetails(candidate.symbol)} className="h-auto gap-2 p-0 text-left">
                    <span className="text-[11px] font-semibold text-muted-foreground">#{candidate.discoveryRank}</span>
                    <span className="font-semibold text-accent-blue hover:underline">{candidate.symbol}</span>
                  </Button>
                  <div className="mt-1"><CandidateBadges candidate={candidate} /></div>
                </div>
                <CandidateMetrics candidate={candidate} />
                <div className="min-w-0 space-y-1">
                  <CandidateFacts candidate={candidate} />
                  <WorkflowActions candidate={candidate} />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2 md:hidden">
            {candidates.map((candidate) => (
              <article key={candidate.symbol} className="min-w-0 rounded-md border border-border bg-card p-3">
                <Button type="button" variant="link" onClick={() => onOpenDetails(candidate.symbol)} className="h-auto gap-2 p-0 text-left">
                  <span className="text-[11px] font-semibold text-muted-foreground">#{candidate.discoveryRank}</span>
                  <span className="font-semibold text-accent-blue">{candidate.symbol}</span>
                </Button>
                <div className="mt-1.5"><CandidateBadges candidate={candidate} /></div>
                <div className="mt-2"><CandidateMetrics candidate={candidate} /></div>
                <div className="mt-2"><CandidateFacts candidate={candidate} /></div>
                <div className="mt-1.5"><WorkflowActions candidate={candidate} /></div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}