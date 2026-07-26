import { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { etTimestampLabel, relativeAge } from "@/lib/pre-market/builders";
import type { SectionEnvelope } from "@/types/pre-market";

interface SectionShellProps<T> {
  title: string;
  subtitle?: string;
  section: SectionEnvelope<T> | null;
  loading: boolean;
  emptyMessage: string;
  onRetry: () => void;
  action?: ReactNode;
  children: ReactNode;
  /** Skip the built-in empty short-circuit (used by object-shaped sections). */
  renderWhenEmpty?: boolean;
}

export const REASON_TEXT: Record<string, string> = {
  NO_QUALIFYING_DATA: "No qualifying records in the current data.",
  SOURCE_STALE: "Source data is older than the freshness threshold.",
  QUERY_FAILED: "This section could not be loaded.",
  CALENDAR_UNAVAILABLE:
    "The market session cannot be confirmed — market calendar data is unavailable.",
  CALENDAR_CONTRADICTORY:
    "The market session cannot be confirmed — NYSE and NASDAQ calendar data disagree.",
  PROVIDER_TIME_INVALID:
    "The market session cannot be confirmed — the provider returned an unusable Eastern Time reference.",
  INCOMPLETE_COVERAGE:
    "Some required records failed validation, so this section is withheld rather than shown incomplete.",
  SOURCE_UNVERIFIABLE:
    "Matching records exist but none carry a verifiable source timestamp, so nothing is shown.",
  NON_TRADING_DAY: "No trading session today.",
  OUTSIDE_PREMARKET: "No current Pre-Market session.",
  WATCHLIST_EMPTY: "Your watchlist has no symbols yet.",
  ANALYSIS_AWAITING_REFRESH: "Analyses are awaiting refresh.",
  NEWS_FEED_EMPTY: "No headlines available.",
};

export function SectionHeading({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function FreshnessLine({ section }: { section: SectionEnvelope<unknown> | null }) {
  if (!section?.as_of) return null;
  const age = relativeAge(section.as_of);
  const exact = etTimestampLabel(section.as_of);
  if (!exact) return null;
  return (
    <p className="text-[11px] text-muted-foreground">
      {section.status === "stale" ? "Last available" : "As of"} {exact}
      {age ? ` · ${age}` : ""}
    </p>
  );
}

export function SectionUnavailable({ reason, onRetry }: { reason: string | null; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <span>{REASON_TEXT[reason ?? ""] ?? "This section is unavailable."}</span>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
      >
        <RefreshCw className="h-3 w-3" /> Retry
      </button>
    </div>
  );
}

export function SectionLoading({ rows = 2 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

export function SectionEmpty({ message, reason }: { message: string; reason?: string | null }) {
  return (
    <div className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
      {message}
      {reason && REASON_TEXT[reason] ? <span className="block mt-1 opacity-80">{REASON_TEXT[reason]}</span> : null}
    </div>
  );
}

export function SectionShell<T>({
  title, subtitle, section, loading, emptyMessage, onRetry, action, children, renderWhenEmpty,
}: SectionShellProps<T>) {
  const isEmptyArray = Array.isArray(section?.data) && (section?.data as unknown[]).length === 0;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading title={title} subtitle={subtitle} action={action} />
      {loading ? (
        <SectionLoading />
      ) : !section || section.status === "unavailable" ? (
        <SectionUnavailable reason={section?.reason_code ?? "QUERY_FAILED"} onRetry={onRetry} />
      ) : isEmptyArray && !renderWhenEmpty ? (
        <SectionEmpty message={emptyMessage} reason={section.reason_code} />
      ) : (
        <>
          {section.status === "stale" && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
              Stale source — shown as last available, not current.
            </div>
          )}
          {children}
        </>
      )}
      {!loading && section && section.status !== "unavailable" && <FreshnessLine section={section} />}
    </section>
  );
}
