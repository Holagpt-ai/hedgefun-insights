import { Badge } from "@/components/ui/badge";
import type { RepeatMoverComparableEpisode, RepeatMoverContext } from "@/types/repeat-mover";

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

function hasUsefulHistory(context: RepeatMoverContext | null | undefined): context is RepeatMoverContext {
  if (!context?.profile.profileAvailable) return false;
  return (context.profile.episodeCount ?? 0) > 0 || context.comparableHistory.comparableEpisodeCount > 0;
}

export function historyContextLabel(context: RepeatMoverContext | null | undefined): string | null {
  if (!hasUsefulHistory(context)) return null;
  const count = context.comparableHistory.comparableEpisodeCount;
  if (count > 0) return `${count} Similar`;
  return "Repeat Mover";
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

export function HistoryCell({
  context,
  onOpen,
}: {
  context: RepeatMoverContext | null | undefined;
  onOpen?: () => void;
}) {
  const label = historyContextLabel(context);
  if (!label) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (!onOpen) {
    return <span className="text-[11px] font-medium text-accent-blue">{label}</span>;
  }
  return (
    <button
      type="button"
      className="text-[11px] font-medium text-accent-blue hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {label}
    </button>
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
        profile.sessionsObserved !== null
          ? { label: "Sessions observed", value: profile.sessionsObserved.toLocaleString() }
          : null,
        profile.episodeCount !== null
          ? { label: "Episode count", value: profile.episodeCount.toLocaleString() }
          : null,
      ].filter((metric): metric is { label: string; value: string } => metric !== null)
    : [];
  const comparables = context?.comparableHistory.closestComparableEpisodes.slice(0, 3) ?? [];
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