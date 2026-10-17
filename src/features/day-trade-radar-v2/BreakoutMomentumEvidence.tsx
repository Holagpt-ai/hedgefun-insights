import {
  buildRecordedBreakoutEvents,
  formatBreakoutFreshnessBadge,
  formatBreakoutLeaderExplanation,
} from "./breakout-event-evidence";
import { qualifiesBreakouts } from "./multi-radar";
import type { RadarRankedRow } from "./types";

export function BreakoutMomentumEvidence({
  row,
  nowMs,
  featuredLeader = false,
  breakoutLeaderPeers,
}: {
  row: RadarRankedRow;
  nowMs: number;
  featuredLeader?: boolean;
  breakoutLeaderPeers?: readonly RadarRankedRow[];
}) {
  if (!qualifiesBreakouts(row, nowMs)) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        No recorded breakout scanner events for this symbol.
      </div>
    );
  }

  const events = buildRecordedBreakoutEvents(row, nowMs);
  if (events.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        Event history unavailable.
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="breakout-momentum-evidence">
      {featuredLeader ? (
        <p className="text-[11px] text-muted-foreground">
          {formatBreakoutLeaderExplanation(row, nowMs, breakoutLeaderPeers)}
        </p>
      ) : null}
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Recorded momentum sequence
      </div>
      <ol className="space-y-1.5 border-l border-border pl-3">
        {events.map((event) => (
          <li key={event.canonicalKey} className="text-[12px]">
            <div className="font-medium text-foreground">{event.label ?? event.type}</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              {event.triggeredAtEt ?? "Observation time unavailable"}
              {" · "}
              {formatBreakoutFreshnessBadge(event.freshness)}
              {!event.active ? " · Recorded inactive" : ""}
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[10px] text-muted-foreground">
        Persisted scanner events are historical evidence. Recent participation and volume still govern actionable momentum.
      </p>
    </div>
  );
}
