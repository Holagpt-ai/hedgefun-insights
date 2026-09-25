import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { RepeatMoverComparableEpisode, RepeatMoverContext } from "@/types/repeat-mover";
import { ScannerMetricHint } from "./ScannerMetricHint";
import {
  comparableEpisodeFacts,
  episodeSessionHeading,
  episodeTierLabel,
  historyDetailCopy,
  loadedComparableEpisodes,
} from "./history-detail";
import { HISTORY_BLANK, HISTORY_HEADER } from "./scanner-metric-copy";

const PARTIAL_QUALITIES = new Set(["INSUFFICIENT", "LIMITED"]);

function formatQuality(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatPercent(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatRvol(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${value.toFixed(1)}× RVOL`;
}

function finiteCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** Verified momentum-episode count. Comparable-episode similarity is not a substitute. */
export function verifiedPriorRunCount(
  context: RepeatMoverContext | null | undefined,
): number | null {
  if (!context?.profile?.profileAvailable) return null;
  const count = context.profile.episodeCount;
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return null;
  return Math.floor(count);
}

export function historyContextLabel(context: RepeatMoverContext | null | undefined): string | null {
  const count = verifiedPriorRunCount(context);
  if (count === null) return null;
  return count === 1 ? "1 prior run" : `${count} prior runs`;
}

export function RepeatMoverBadge({ context }: { context: RepeatMoverContext | null | undefined }) {
  const label = historyContextLabel(context);
  if (!label) return null;
  return (
    <Badge
      variant="outline"
      className="h-4 shrink-0 rounded px-1.5 py-0 text-[9px] font-semibold normal-case tracking-normal text-accent-blue"
    >
      {label}
    </Badge>
  );
}

function stopRowActivation(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

function HistoryDetailTrigger({
  visible,
  hover,
  className,
  children,
}: {
  visible: string;
  hover: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <TooltipProvider delayDuration={250}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={className}
                aria-label={`${visible}. ${hover}`}
                onClick={stopRowActivation}
                onKeyDown={stopRowActivation}
              >
                {visible}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="hidden max-w-xs text-xs md:block">
            {hover}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          align="start"
          className="max-h-80 w-80 overflow-y-auto p-3"
          data-testid="history-detail"
          onClick={stopRowActivation}
        >
          {children}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

export function PriorMomentumHistory({ context }: { context: RepeatMoverContext }) {
  const count = verifiedPriorRunCount(context);
  if (count === null) return null;
  const copy = historyDetailCopy(context, count);
  const episodes = loadedComparableEpisodes(context);
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Prior momentum history
      </div>
      <div className="text-[13px] font-medium text-foreground">{copy.verifiedRuns}</div>
      {copy.showing && (
        <p className="text-[11px] text-muted-foreground">{copy.showing}</p>
      )}
      {copy.emptyDetails && (
        <p className="text-[12px] text-muted-foreground">{copy.emptyDetails}</p>
      )}
      <p className="text-[11px] text-muted-foreground">
        Verified historical Stocksist momentum episodes for this ticker.
      </p>
      {episodes.length > 0 && (
        <div>
          {episodes.map((episode) => (
            <HistoryEpisodeCard key={episode.episodeId} episode={episode} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryEpisodeCard({ episode }: { episode: RepeatMoverComparableEpisode }) {
  const heading = episodeSessionHeading(episode.sessionDate);
  const tier = episodeTierLabel(episode.tier);
  const facts = comparableEpisodeFacts(episode);
  return (
    <div className="border-t border-border py-2 first:border-t-0">
      <div className="flex items-baseline justify-between gap-2">
        {heading && <div className="text-[12px] font-medium text-foreground">{heading}</div>}
        {tier && <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{tier}</div>}
      </div>
      {facts.length > 0 && (
        <dl className="mt-1 space-y-0.5">
          {facts.map((fact) => (
            <div key={`${episode.episodeId}-${fact.label}`} className="flex gap-2 text-[11px]">
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd className="tabular-nums text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function HistoryCell({
  context,
}: {
  context: RepeatMoverContext | null | undefined;
}) {
  if (context?.profile?.profileAvailable === false) {
    return (
      <HistoryDetailTrigger
        visible="—"
        hover={HISTORY_BLANK}
        className="text-[11px] text-muted-foreground"
      >
        <p className="text-[12px] text-foreground">Historical profile unavailable</p>
      </HistoryDetailTrigger>
    );
  }
  const label = historyContextLabel(context);
  if (!label || !context) {
    return (
      <ScannerMetricHint label={HISTORY_BLANK} className="text-muted-foreground">
        —
      </ScannerMetricHint>
    );
  }
  return (
    <HistoryDetailTrigger
      visible={label}
      hover={HISTORY_HEADER}
      className="text-[11px] font-medium text-accent-blue hover:underline"
    >
      <PriorMomentumHistory context={context} />
    </HistoryDetailTrigger>
  );
}

function ComparableEpisode({ episode }: { episode: RepeatMoverComparableEpisode }) {
  const facts = [
    formatPercent(episode.movePct),
    formatRvol(episode.rvol),
    formatQuality(episode.tier),
    episode.nextSessionMovePct === null
      ? null
      : `${formatPercent(episode.nextSessionMovePct)} next session`,
  ].filter((fact): fact is string => Boolean(fact));

  return (
    <div className="min-w-0 border-t border-border py-2 first:border-t-0 first:pt-0 last:pb-0">
      {formatDate(episode.sessionDate) && (
        <div className="text-[12px] font-medium tabular-nums text-foreground">
          {formatDate(episode.sessionDate)}
        </div>
      )}
      {facts.length > 0 && (
        <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
          {facts.map((fact) => <span key={fact}>{fact}</span>)}
        </div>
      )}
    </div>
  );
}

export function HistoricalBehaviorSection({ context }: { context: RepeatMoverContext | null | undefined }) {
  const profile = context?.profile;
  const available = profile?.profileAvailable === true;
  const metrics = available
    ? [
        profile.sampleSizeQuality
          ? { label: "Sample quality", value: formatQuality(profile.sampleSizeQuality) }
          : null,
        finiteCount(profile.sessionsObserved) > 0
          ? { label: "Sessions observed", value: finiteCount(profile.sessionsObserved).toLocaleString() }
          : null,
        finiteCount(profile.episodeCount) > 0
          ? { label: "Episode count", value: finiteCount(profile.episodeCount).toLocaleString() }
          : null,
      ].filter((metric): metric is { label: string; value: string } => metric !== null)
    : [];
  const comparables = context?.comparableHistory?.closestComparableEpisodes?.slice(0, 3) ?? [];
  const partial = available && (!profile.sampleSizeQuality || PARTIAL_QUALITIES.has(profile.sampleSizeQuality));

  return (
    <section className="space-y-2" data-testid="historical-behavior">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Historical Behavior
      </div>
      {!available ? (
        <p className="text-[12px] text-muted-foreground">Historical behavior not available yet.</p>
      ) : (
        <>
          {partial && (
            <p className="text-[11px] text-muted-foreground">Historical profile still building</p>
          )}
          {metrics.length > 0 && (
            <dl className="grid grid-cols-3 gap-2">
              {metrics.map((metric) => (
                <div key={metric.label} className="min-w-0">
                  <dt className="text-[10px] text-muted-foreground">{metric.label}</dt>
                  <dd className="text-[12px] font-medium tabular-nums text-foreground">{metric.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {comparables.length > 0 && (
            <div className="min-w-0 pt-1">
              <div className="mb-1 text-[10px] font-medium text-muted-foreground">Closest comparable episodes</div>
              <div className="min-w-0">
                {comparables.map((episode) => (
                  <ComparableEpisode key={episode.episodeId} episode={episode} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}