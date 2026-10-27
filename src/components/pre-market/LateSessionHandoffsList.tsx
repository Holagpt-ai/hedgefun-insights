import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type {
  AmInboxLateSessionCandidate,
  LateSessionContinuationFunnel,
} from "@/lib/am-inbox/late-session-continuation-types";
import { buildLateSessionPriorityEvaluation } from "@/lib/am-inbox/am-inbox-late-session-view";
import {
  AM_INBOX_LATE_SESSION_EXPANDED_PAGE_SIZE,
  AM_INBOX_LATE_SESSION_VISIBLE_LIMIT,
} from "@/config/late-session-handoff.config";
import {
  buildContinuationCapturedRvolDisplay,
  formatContinuationCaptureTimestampEt,
} from "@/lib/am-inbox/continuation-rvol-display";
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
  const rvolDisplay = buildContinuationCapturedRvolDisplay(context);
  const captureEt = formatContinuationCaptureTimestampEt(context.sourceTimestamp);

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
          Captured session {context.sourceSessionDate}
          {captureEt ? ` · ${captureEt}` : ""}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Prior-session snapshot — not live market activity
      </p>
      <div className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
        {eventLabel ? <span>Recorded event: {eventLabel}</span> : null}
        <span>{rvolDisplay.line}</span>
        <span>Captured price: {formatNum(context.lastPrice, 2)}</span>
        <span>Captured volume: {formatNum(context.volume, 0)}</span>
        <span>Captured HOD distance: {formatNum(context.closeDistanceFromHodPct, 2)}%</span>
        <span>
          Recorded catalyst:{" "}
          {context.catalystPresent === true
            ? "Flagged at capture"
            : context.catalystPresent === false
              ? "None at capture"
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
  loading = false,
  error = false,
  refreshWarning = false,
  onRetry,
  expiredCount = 0,
}: {
  candidates: readonly AmInboxLateSessionCandidate[];
  qualifiedCandidates?: readonly AmInboxLateSessionCandidate[];
  funnel?: LateSessionContinuationFunnel;
  visibleLimit?: number;
  loading?: boolean;
  /** Initial load failed with no prior view to show. */
  error?: boolean;
  /** Background refresh failed; cards below are from the last successful load. */
  refreshWarning?: boolean;
  onRetry?: () => void;
  expiredCount?: number;
}) {
  const qualifiedPool = qualifiedCandidates ?? candidates;
  const [expanded, setExpanded] = useState(false);
  const [expandedRenderCount, setExpandedRenderCount] = useState(
    AM_INBOX_LATE_SESSION_VISIBLE_LIMIT,
  );

  useEffect(() => {
    if (!expanded) {
      setExpandedRenderCount(AM_INBOX_LATE_SESSION_VISIBLE_LIMIT);
    }
  }, [expanded]);

  const priorityEval = useMemo(() => {
    if (qualifiedPool.length === 0) return null;
    return buildLateSessionPriorityEvaluation(qualifiedPool);
  }, [qualifiedPool]);

  const hasQualified = qualifiedPool.length > 0;
  const hasPriority = candidates.length > 0;
  const hasVisiblePool = hasQualified || hasPriority;

  if (loading && !hasVisiblePool) {
    return (
      <div
        className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground"
        aria-busy="true"
        data-testid="am-inbox-late-session-handoffs-loading"
      >
        Loading prior-session continuation captures…
      </div>
    );
  }

  if (error && !hasVisiblePool) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-50/80 px-4 py-6 text-center text-sm text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-100"
        data-testid="am-inbox-late-session-handoffs-error"
      >
        <p>Could not load continuation candidates. Prior-session cards are hidden until retry succeeds.</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (!hasVisiblePool) {
    return (
      <div
        className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground"
        data-testid="am-inbox-late-session-handoffs-empty"
      >
        No qualified prior-session continuation candidates for this AM session.
        {expiredCount > 0 ? ` (${expiredCount} expired capture${expiredCount === 1 ? "" : "s"} omitted.)` : null}
      </div>
    );
  }

  const stats = funnel ?? {
    detectedCount: qualifiedPool.length,
    qualifiedCount: qualifiedPool.length,
    priorityCount: candidates.length,
    displayedCount: Math.min(candidates.length, visibleLimit),
    displayUsesQualifiedFallback: false,
  };

  const defaultVisible =
    candidates.length > 0
      ? candidates.slice(0, visibleLimit)
      : (funnel?.displayUsesQualifiedFallback || (funnel?.priorityCount ?? 0) === 0) &&
          qualifiedPool.length > 0
        ? qualifiedPool.slice(0, visibleLimit)
        : [];
  const visible = expanded
    ? qualifiedPool.slice(0, expandedRenderCount)
    : defaultVisible;
  const canViewAllQualified = qualifiedPool.length > defaultVisible.length;
  const canLoadMoreExpanded =
    expanded && expandedRenderCount < qualifiedPool.length;

  return (
    <div className="flex flex-col gap-2" data-testid="am-inbox-late-session-handoffs">
      {refreshWarning ? (
        <div
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400"
          data-testid="am-inbox-late-session-handoffs-refresh-warning"
        >
          Could not refresh continuation candidates — showing the last successful load.
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="ml-2 inline-flex items-center gap-1 font-medium text-amber-800 underline hover:no-underline dark:text-amber-300"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        {stats.detectedCount} detected · {stats.qualifiedCount} qualified ·{" "}
        {stats.priorityCount} priority
        {stats.priorityCount > defaultVisible.length
          ? ` · Showing top ${defaultVisible.length}`
          : null}
      </p>
      {visible.map((entry) => (
        <HandoffCard
          key={`${entry.context.symbol}-${entry.context.sourceSessionDate}-${entry.context.sourceCategory}-${entry.context.sourceTimestamp}`}
          entry={entry}
          showQualifiedLabel={priorityEval ? !priorityEval.isPriority(entry) : false}
        />
      ))}
      {canLoadMoreExpanded ? (
        <button
          type="button"
          onClick={() =>
            setExpandedRenderCount((n) =>
              Math.min(n + AM_INBOX_LATE_SESSION_EXPANDED_PAGE_SIZE, qualifiedPool.length),
            )
          }
          className="text-xs font-medium text-accent-blue hover:underline"
        >
          Load more ({qualifiedPool.length - expandedRenderCount} remaining)
        </button>
      ) : null}
      {canViewAllQualified && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((v) => {
              const next = !v;
              if (next) {
                setExpandedRenderCount(AM_INBOX_LATE_SESSION_EXPANDED_PAGE_SIZE);
              }
              return next;
            });
          }}
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
