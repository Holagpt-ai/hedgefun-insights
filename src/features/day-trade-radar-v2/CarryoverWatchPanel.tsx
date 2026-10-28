import { useState } from "react";
import { Link } from "react-router-dom";
import { guardedWorkflowLinkClick } from "@/lib/navigation/guarded-link-click";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { useCarryoverWatch } from "@/hooks/useCarryoverWatch";
import type { CarryoverCandidateView } from "@/lib/radar/carryover-watch";
import { formatVolumeSpeedCompact } from "./multi-radar";
import { formatRadarPercent, formatRadarPrice, formatRadarVolume, moveClass } from "./radar-metrics";

function Handoffs({ row }: { row: CarryoverCandidateView }) {
  const { add, isAdded, pendingSymbol } = useAddToWatchlist();
  const pending = pendingSymbol === row.symbol;
  const added = isAdded(row.symbol);
  const links = [
    ["Catalyst", row.handoffs.catalyst],
    ["AI Analyst", row.handoffs.aiAnalyst],
    ["Journal", row.handoffs.journal],
    ["Action Center", row.handoffs.actionCenter],
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        className="inline-flex min-h-8 items-center rounded-md border border-border px-2 text-[11px] font-semibold"
        disabled={added || pending}
        onClick={() => {
          if (!added && !pending) add(row.symbol);
        }}
      >
        {added ? "Watchlist" : pending ? "Adding" : "Watchlist"}
      </button>
      {links.map(([label, href]) => (
        <Link
          key={label}
          to={href}
          onClick={(event) => guardedWorkflowLinkClick(event)}
          className="inline-flex min-h-8 items-center rounded-md border border-border px-2 text-[11px] font-semibold"
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function CandidateCard({ row }: { row: CarryoverCandidateView }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = `carryover-details-${row.symbol}`;
  const missingSummary =
    row.missingEvidence.length > 0 ? row.missingEvidence.join(", ") : null;

  return (
    <article
      className="min-w-0 rounded-md border border-border bg-card p-3"
      data-testid={`carryover-row-${row.symbol}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-semibold text-accent-blue">{row.symbol}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Prior session · not current
        </div>
      </div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {row.classificationLabel}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px] tabular-nums">
        <span>{formatRadarPrice(row.price)}</span>
        <span className={moveClass(row.movePct)}>{formatRadarPercent(row.movePct)}</span>
        <span>Vol {formatRadarVolume(row.sessionVolume)}</span>
        <span>{formatVolumeSpeedCompact(row.velocity)}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{row.sessionEvidence}</p>
      {expanded ? (
        <div id={detailsId} className="mt-2 space-y-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
          <p>{row.hodLabel} · {row.floatLabel}</p>
          <p>{row.catalystLabel}</p>
          <ul className="space-y-0.5 text-foreground">
            {row.pillarLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {row.evaluatedAtLabel ? (
            <p>Evaluated {row.evaluatedAtLabel}</p>
          ) : (
            <p>Evaluation time unavailable</p>
          )}
          {missingSummary ? <p>Missing evidence: {missingSummary}</p> : null}
        </div>
      ) : missingSummary ? (
        <p className="mt-1 text-[11px] text-muted-foreground">Some pillar evidence unavailable</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          className="min-h-8 text-[11px] font-semibold text-accent-blue hover:underline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide details" : "Details"}
        </button>
        <Handoffs row={row} />
      </div>
    </article>
  );
}

export function CarryoverWatchPanel({ nowMs }: { nowMs: number }) {
  const { loading, view } = useCarryoverWatch(nowMs);
  return (
    <section
      className="min-w-0 rounded-md border border-border bg-card"
      data-testid="radar-panel-carryover"
    >
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-[12px] font-semibold tracking-wide">Previous Session / Carryover Watch</h2>
        <p className="text-[11px] text-muted-foreground">
          {view?.historicalNotice ??
            "Historical prior-session record. A previous-session pass does not qualify the current session."}
        </p>
        {view ? (
          <p className="text-[11px] text-muted-foreground">
            Source session {view.sessionLabel} ({view.sessionDate})
            {view.snapshotRecordedAtLabel
              ? ` · snapshot recorded ${view.snapshotRecordedAtLabel}`
              : view.status === "ready"
                ? " · snapshot capture time unavailable"
                : ""}
          </p>
        ) : null}
      </div>
      <div className="space-y-2 p-2">
        {loading ? (
          <p className="px-1 py-4 text-center text-[12px] text-muted-foreground">Loading prior-session history…</p>
        ) : null}
        {!loading && view?.status === "unavailable" ? (
          <p className="px-1 py-4 text-[12px] text-muted-foreground" data-testid="carryover-unavailable">
            {view.unavailableReason}
          </p>
        ) : null}
        {!loading && view?.status === "empty" ? (
          <p className="px-1 py-4 text-[12px] text-muted-foreground" data-testid="carryover-empty">
            No retained prior-session snapshot for {view.sessionLabel}. Nothing is being estimated.
          </p>
        ) : null}
        {!loading && view?.status === "ready" ? (
          <>
            {view.sourceNote ? (
              <p className="px-1 text-[11px] text-muted-foreground">{view.sourceNote}</p>
            ) : null}
            {view.pillarNote ? (
              <p className="px-1 text-[11px] text-muted-foreground">{view.pillarNote}</p>
            ) : null}
            {view.withheldInvalidQuotes > 0 ? (
              <p className="px-1 text-[11px] text-muted-foreground">
                {view.withheldInvalidQuotes} invalid price or zero-volume records were withheld from cards.
              </p>
            ) : null}
            {view.candidates.length === 0 ? (
              <p className="px-1 py-4 text-[12px] text-muted-foreground">
                No actionable prior-session names were retained.
              </p>
            ) : (
              <div className="space-y-2 overflow-x-auto">
                {view.candidates.map((row) => (
                  <CandidateCard key={row.symbol} row={row} />
                ))}
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
