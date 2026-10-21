import { useEffect, useMemo, useState } from "react";
import type { PostMomentumForwardOutcomesByHorizon } from "@/lib/intraday-reconstruction/compute-post-momentum-forward-outcomes";
import { INTRADAY_FORWARD_OUTCOME_HORIZONS } from "@/config/intraday-forward-outcomes.config";
import { Link } from "react-router-dom";
import type { HistoricalMatchSummary } from "@/lib/historical-intelligence/historical-match-summary";
import {
  listHistoricalExplorerEpisodes,
  summarizeExplorerCoverage,
  type HistoricalEpisodeExplorerModel,
  type HistoricalEpisodeReplayStep,
} from "@/lib/historical-intelligence/historical-episode-explorer";
import type { RepeatMoverContext } from "@/types/repeat-mover";
import { workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";
import { MARKET_PULSE_CAUSATION_DISCLAIMER } from "@/lib/markets/market-pulse-catalyst";

function formatSessionDate(value: string | null): string {
  if (!value) return "Session date unavailable";
  const ms = Date.parse(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(ms)) return value;
  return new Date(ms).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatEtTime(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

function ReplayStepRow({ step }: { step: HistoricalEpisodeReplayStep }) {
  const time = formatEtTime(step.eventAt);
  return (
    <li className="rounded border border-border/60 bg-background/40 px-2 py-1.5 text-[11px]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-foreground">{step.label}</span>
        {time ? <span className="tabular-nums text-muted-foreground">{time} ET</span> : null}
      </div>
      {step.detail ? <p className="mt-0.5 text-muted-foreground">{step.detail}</p> : null}
      {(step.price != null || step.volume != null) && (
        <p className="mt-0.5 tabular-nums text-muted-foreground">
          {step.price != null ? `$${step.price.toFixed(2)}` : null}
          {step.volume != null ? ` · Vol ${step.volume.toLocaleString()}` : null}
        </p>
      )}
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {step.phase === "known_at_event"
          ? "Known at episode"
          : step.phase === "observed_afterward"
            ? "Observed afterward"
            : "Recorded observation"}
      </p>
    </li>
  );
}

function ForwardOutcomesBlock({ outcomes }: { outcomes: PostMomentumForwardOutcomesByHorizon | null }) {
  if (!outcomes) return null;
  const rows = INTRADAY_FORWARD_OUTCOME_HORIZONS.flatMap((horizon) => {
    const window = outcomes[horizon];
    if (!window) return [];
    if (window.availabilityState === "INSUFFICIENT_BARS" || window.availabilityState === "INVALID_REFERENCE") {
      return [{ horizon, text: "Unavailable in stored bars" }];
    }
    const parts: string[] = [];
    if (window.endReturnPct != null) parts.push(`Return ${window.endReturnPct > 0 ? "+" : ""}${window.endReturnPct.toFixed(1)}%`);
    if (window.continuation === true) parts.push("Continuation recorded");
    if (window.continuation === false) parts.push("No continuation recorded");
    if (window.availabilityState === "PARTIAL_WINDOW") parts.push("Partial window");
    return [{ horizon, text: parts.length > 0 ? parts.join(" · ") : "Recorded observation" }];
  });
  if (rows.length === 0) return null;
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Post-momentum forward outcomes (historical)
      </h4>
      <ul className="mt-1 list-inside list-disc text-[11px] text-muted-foreground">
        {rows.map((row) => (
          <li key={row.horizon}>
            {row.horizon === "SESSION_CLOSE" ? "Session close" : `+${String(row.horizon)} min`}: {row.text}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[10px] text-muted-foreground">Past observations only — not a forecast.</p>
    </div>
  );
}

function EpisodeDetail({ model }: { model: HistoricalEpisodeExplorerModel }) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = model.replaySteps;
  const active = steps[stepIndex] ?? null;
  const routes = workflowSymbolRoutes(model.symbol, { securityId: model.securityId ?? undefined });

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2 text-[11px]">
        <div>
          <span className="text-muted-foreground">Momentum: </span>
          {model.momentumEventLabel}
        </div>
        <div>
          <span className="text-muted-foreground">Move / RVOL: </span>
          {model.movePct != null ? `${model.movePct > 0 ? "+" : ""}${model.movePct.toFixed(1)}%` : "—"}
          {model.rvol != null ? ` · ${model.rvol.toFixed(1)}× RVOL` : null}
        </div>
        <div>
          <span className="text-muted-foreground">Volume: </span>
          {model.volume != null ? model.volume.toLocaleString() : "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Gap / float: </span>
          {model.gapPct != null ? `${model.gapPct.toFixed(1)}% gap` : "—"}
          {model.floatTurnover != null ? ` · ${(model.floatTurnover * 100).toFixed(0)}% float turnover` : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Event-time match evidence
          </h4>
          {model.matchRationale.eventTimeEvidenceLines.length === 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">No separate event-time qualifiers recorded.</p>
          ) : (
            <ul className="mt-1 list-inside list-disc text-[11px] text-muted-foreground">
              {model.matchRationale.eventTimeEvidenceLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Full-session historical facts
          </h4>
          <ul className="mt-1 list-inside list-disc text-[11px] text-muted-foreground">
            {model.matchRationale.fullSessionHistoricalLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Observed afterward (not used for similarity)
          </h4>
          {model.matchRationale.observedAfterwardLines.length === 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">No forward outcomes recorded.</p>
          ) : (
            <ul className="mt-1 list-inside list-disc text-[11px] text-muted-foreground">
              {model.matchRationale.observedAfterwardLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {model.catalystEvents.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Linked catalyst / event evidence
          </h4>
          <ul className="space-y-1 text-[11px]">
            {model.catalystEvents.map((ev) => (
              <li key={`${ev.title}-${ev.publishedAt}`} className="text-foreground">
                <span className="font-medium">{ev.title}</span>
                <span className="text-muted-foreground">
                  {ev.source ? ` · ${ev.source}` : ""}
                  {ev.publishedAt ? ` · ${ev.publishedAt.slice(0, 10)}` : ""}
                  {` · ${ev.temporalRelationship.replace(/_/g, " ").toLowerCase()}`}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground">{MARKET_PULSE_CAUSATION_DISCLAIMER}</p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {model.replayMode === "stored_timeline"
              ? "Stored intraday timeline"
              : model.replayMode === "observation_timeline"
                ? "Recorded observation timeline"
                : "Insufficient stored points for replay"}
          </h4>
          {steps.length > 1 && (
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
              Scrub
              <input
                type="range"
                min={0}
                max={steps.length - 1}
                value={stepIndex}
                onChange={(e) => setStepIndex(Number(e.target.value))}
                className="w-32"
                aria-label="Replay step scrubber"
              />
            </label>
          )}
        </div>
        {model.undatedSummaryFacts.length > 0 && (
          <ul className="list-inside list-disc text-[11px] text-muted-foreground">
            {model.undatedSummaryFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        )}
        {steps.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No chronological replay points are stored for this episode. Outcome facts may still appear in comparable summaries.
          </p>
        ) : (
          <>
            {active && (
              <div className="rounded-md border border-accent-blue/30 bg-accent-blue/5 p-2">
                <ReplayStepRow step={active} />
              </div>
            )}
            <ol className="max-h-48 space-y-1 overflow-y-auto">
              {steps.map((step, index) => (
                <li key={step.id}>
                  <button
                    type="button"
                    className={`w-full text-left ${index === stepIndex ? "opacity-100" : "opacity-70"}`}
                    onClick={() => setStepIndex(index)}
                  >
                    <ReplayStepRow step={step} />
                  </button>
                </li>
              ))}
            </ol>
          </>
        )}
        <p className="text-[10px] leading-snug text-muted-foreground">{model.limitationLine}</p>
      </div>

      <ForwardOutcomesBlock outcomes={model.postMomentumOutcomes} />

      {routes && (
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-2 text-[11px]">
          <Link to={routes.catalyst} className="text-accent-blue hover:underline">Catalyst</Link>
          <Link to={routes.watchlist} className="text-accent-blue hover:underline">Watchlist</Link>
          <Link to={routes.actionCenter} className="text-accent-blue hover:underline">Action Center</Link>
          <Link to={routes.journal} className="text-accent-blue hover:underline">Journal</Link>
        </div>
      )}
    </div>
  );
}

export function HistoricalEpisodeExplorer({
  symbol,
  context,
  matchSummary,
  initialEpisodeId,
}: {
  symbol: string;
  context: RepeatMoverContext | null | undefined;
  matchSummary?: HistoricalMatchSummary | null;
  initialEpisodeId?: string | null;
}) {
  const episodes = useMemo(
    () => listHistoricalExplorerEpisodes(context, symbol),
    [context, symbol],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialEpisodeId ?? episodes[0]?.episodeId ?? null,
  );
  useEffect(() => {
    if (initialEpisodeId && episodes.some((ep) => ep.episodeId === initialEpisodeId)) {
      setSelectedId(initialEpisodeId);
    }
  }, [initialEpisodeId, episodes]);
  const selected = episodes.find((ep) => ep.episodeId === selectedId) ?? episodes[0] ?? null;
  const coverage = summarizeExplorerCoverage(matchSummary);

  if (episodes.length === 0) {
    return (
      <section className="rounded-md border border-border/70 bg-muted/10 p-3 text-[12px] text-muted-foreground" data-testid="historical-episode-explorer">
        No comparable historical episodes are loaded for this symbol yet.
      </section>
    );
  }

  return (
    <section
      id="historical-episode-explorer"
      className="space-y-3 rounded-md border border-border/70 bg-muted/10 p-3"
      data-testid="historical-episode-explorer"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Historical Episode Explorer
        </h3>
        <label className="text-[11px] text-muted-foreground">
          Episode{" "}
          <select
            className="ml-1 rounded border border-border bg-background px-1.5 py-0.5 text-foreground"
            value={selected?.episodeId ?? ""}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {episodes.map((ep) => (
              <option key={ep.episodeId} value={ep.episodeId}>
                {formatSessionDate(ep.sessionDate)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {coverage ? <p className="text-[10px] text-muted-foreground">{coverage}</p> : null}
      {selected ? <EpisodeDetail model={selected} /> : null}
    </section>
  );
}
