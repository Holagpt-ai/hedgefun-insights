import { useState } from "react";
import type {
  AmInboxLateSessionCandidate,
  LateSessionContinuationFunnel,
} from "@/lib/am-inbox/late-session-continuation-types";
import { isLateSessionPriorityCandidate } from "@/lib/am-inbox/am-inbox-late-session-view";
import { AM_INBOX_LATE_SESSION_VISIBLE_LIMIT } from "@/config/late-session-handoff.config";
import { formatScannerEventLabel } from "@/lib/screeners/scanner-events-display";
import { revealToggleLabel } from "@/lib/session-intelligence/reveal";
import { PreMarketSymbolActions } from "./PreMarketSymbolActions";

const CATEGORY_LABEL: Record<string, string> = {
  POWER_HOUR_MOMENTUM: "Power-Hour Momentum",
  AFTER_HOURS_CONTINUATION: "After-Hours Continuation",
  STRONG_CLOSE_NEAR_HOD: "Strong Close Near HOD",
  DAY_TWO_WATCH: "Day-Two Watch",
};

function formatNum(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function HandoffCard({
  entry,
  showQualifiedLabel,
}: {
  entry: AmInboxLateSessionCandidate;
  showQualifiedLabel: boolean;
}) {
  const { context } = entry;
  const categories = entry.sourceCategories.length > 0
    ? entry.sourceCategories
    : [context.sourceCategory];
  const eventLabel =
    context.evidenceLabels[0] ??
    formatScannerEventLabel(entry.sourceCategories[0] ?? null) ??
    null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">{context.symbol}</span>
        {showQualifiedLabel ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Qualified · not priority
          </span>
        ) : null}
        {categories.map((cat) => (
          <span
            key={cat}
            className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            {CATEGORY_LABEL[cat] ?? cat}
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground">
          Prior session {context.sourceSessionDate}
        </span>
      </div>
      <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
        {eventLabel ? <span>Event: {eventLabel}</span> : null}
        <span>5m RVOL: {formatNum(context.rvol, 2)}</span>
        <span>HOD distance: {formatNum(context.closeDistanceFromHodPct, 2)}%</span>
        <span>
          Catalyst:{" "}
          {context.catalystPresent === true
            ? "Present"
            : context.catalystPresent === false
              ? "None verified"
              : "—"}
        </span>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {context.historicalContextAvailable
          ? `Historical context · ${context.comparableEpisodeCount} comparable episodes`
          : "Historical context unavailable"}
        {context.evidenceLabels.length > 0
          ? ` · ${context.evidenceLabels.join(", ")}`
          : null}
      </div>
      <PreMarketSymbolActions symbol={context.symbol} securityId={context.securityId} />
    </div>
  );
}

export function LateSessionHandoffsList({
  candidates,
  qualifiedCandidates,
  funnel,
  visibleLimit = AM_INBOX_LATE_SESSION_VISIBLE_LIMIT,
}: {
  candidates: readonly AmInboxLateSessionCandidate[];
  qualifiedCandidates?: readonly AmInboxLateSessionCandidate[];
  funnel?: LateSessionContinuationFunnel;
  visibleLimit?: number;
}) {
  const qualifiedPool = qualifiedCandidates ?? candidates;
  const hasQualified = qualifiedPool.length > 0;
  const hasPriority = candidates.length > 0;

  if (!hasQualified && !hasPriority) return null;

  const [expanded, setExpanded] = useState(false);

  const stats = funnel ?? {
    detectedCount: qualifiedPool.length,
    qualifiedCount: qualifiedPool.length,
    priorityCount: candidates.length,
    displayedCount: Math.min(candidates.length, visibleLimit),
  };

  const defaultVisible = candidates.slice(0, visibleLimit);
  const visible = expanded ? qualifiedPool : defaultVisible;
  const canViewAllQualified = qualifiedPool.length > defaultVisible.length;

  return (
    <div className="flex flex-col gap-2" data-testid="am-inbox-late-session-handoffs">
      <p className="text-[11px] text-muted-foreground">
        {stats.detectedCount} detected · {stats.qualifiedCount} qualified ·{" "}
        {stats.priorityCount} priority
        {stats.priorityCount > defaultVisible.length
          ? ` · Showing top ${defaultVisible.length}`
          : null}
      </p>
      {visible.map((entry) => (
        <HandoffCard
          key={`${entry.context.symbol}-${entry.context.sourceSessionDate}-${entry.context.sourceCategory}`}
          entry={entry}
          showQualifiedLabel={
            !isLateSessionPriorityCandidate(entry, qualifiedPool)
          }
        />
      ))}
      {canViewAllQualified && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-accent-blue hover:underline"
        >
          {expanded
            ? "Show Less"
            : revealToggleLabel(false, qualifiedPool.length)}
        </button>
      )}
    </div>
  );
}
