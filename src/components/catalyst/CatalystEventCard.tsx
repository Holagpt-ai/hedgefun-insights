import { Link } from "react-router-dom";
import {
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  ExternalLink,
  LineChart,
  NotebookPen,
  Sparkles,
  Eye,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CatalystEvent } from "@/types/catalyst";
import {
  EVENT_TYPE_LABEL,
  formatEpsValue,
  formatSurprisePct,
  timeOfDayLabel,
} from "@/lib/catalyst/parsers";
import { cn } from "@/lib/utils";

interface CatalystEventCardProps {
  event: CatalystEvent;
  isSaved: boolean;
  isReviewed: boolean;
  onToggleSaved: () => void;
  onToggleReviewed: () => void;
  disabled?: boolean;
}

function formatDate(row: CatalystEvent): string {
  const d = row.event_date ?? (row.event_time ? row.event_time.slice(0, 10) : null);
  if (!d) return "Date Unavailable";
  try {
    const dt = new Date(`${d}T00:00:00Z`);
    return dt.toLocaleDateString(undefined, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function formatExactTime(row: CatalystEvent): string | null {
  if (!row.event_time) return null;
  try {
    return new Date(row.event_time).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return null;
  }
}

function formatPublished(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function EarningsFacts({ facts }: { facts: Record<string, unknown> }) {
  const est = formatEpsValue(facts.estimate_eps);
  const actual = formatEpsValue(facts.actual_eps);
  const surprise = formatSurprisePct(facts.surprise_percent);
  if (!est && !actual && !surprise) return null;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
      <div className="rounded border border-border bg-muted/40 px-2 py-1.5">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Estimate EPS</div>
        <div className="font-medium tabular-nums">{est ?? "Not reported"}</div>
      </div>
      <div className="rounded border border-border bg-muted/40 px-2 py-1.5">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Actual EPS</div>
        <div className="font-medium tabular-nums">{actual ?? "Not reported"}</div>
      </div>
      <div className="rounded border border-border bg-muted/40 px-2 py-1.5">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Surprise</div>
        <div className="font-medium tabular-nums">{surprise ?? "Not reported"}</div>
      </div>
    </div>
  );
}

export function CatalystEventCard({
  event,
  isSaved,
  isReviewed,
  onToggleSaved,
  onToggleReviewed,
  disabled,
}: CatalystEventCardProps) {
  const exactTime = formatExactTime(event);
  const todLabel = event.time_of_day ? timeOfDayLabel(event.time_of_day) : null;
  const publishedLabel = formatPublished(event.published_at);
  const showTitle = event.event_type !== "earnings" && event.title;

  return (
    <Card className={cn("p-4 space-y-3 transition-colors", isReviewed && "opacity-80")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to={`/stocks/${encodeURIComponent(event.symbol)}`}
              className="font-semibold text-accent-blue hover:underline"
            >
              {event.symbol}
            </Link>
            {event.company_name && (
              <span className="text-[13px] text-muted-foreground truncate">
                {event.company_name}
              </span>
            )}
            <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
              {EVENT_TYPE_LABEL[event.event_type]}
            </Badge>
            {event.verification_state === "provider_reported" && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                Provider Reported
              </Badge>
            )}
            {isReviewed && (
              <Badge variant="outline" className="text-[10px] gap-1 text-emerald-600 border-emerald-500/50">
                <CheckCircle2 className="h-3 w-3" /> Reviewed
              </Badge>
            )}
          </div>
          {showTitle && (
            <div className="mt-1.5 text-[14px] font-medium leading-snug break-words">
              {event.title}
            </div>
          )}
          {event.description && event.event_type !== "earnings" && (
            <div className="mt-1 text-[13px] text-muted-foreground leading-relaxed break-words">
              {event.description}
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSaved}
            disabled={disabled}
            aria-label={isSaved ? "Unsave event" : "Save event"}
            title={isSaved ? "Unsave" : "Save"}
          >
            {isSaved ? (
              <BookmarkCheck className="h-4 w-4 text-accent-blue" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleReviewed}
            disabled={disabled}
            aria-label={isReviewed ? "Undo reviewed" : "Mark reviewed"}
            title={isReviewed ? "Undo reviewed" : "Mark reviewed"}
          >
            <Eye className={cn("h-4 w-4", isReviewed && "text-emerald-600")} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
        <span className="tabular-nums text-foreground/80">{formatDate(event)}</span>
        {exactTime ? (
          <span className="tabular-nums">{exactTime}</span>
        ) : todLabel ? (
          <span>{todLabel}</span>
        ) : null}
        <span>·</span>
        <span>Source: {event.source_name}</span>
        {publishedLabel && (
          <>
            <span>·</span>
            <span>Published {publishedLabel}</span>
          </>
        )}
      </div>

      {event.event_type === "earnings" && <EarningsFacts facts={event.facts ?? {}} />}

      {event.related_symbols.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
            Related:
          </span>
          {event.related_symbols.slice(0, 8).map((s) => (
            <Link
              key={s}
              to={`/dashboard/catalyst?symbol=${encodeURIComponent(s)}`}
              className="text-[11px] font-medium text-accent-blue hover:underline"
            >
              {s}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
        {event.source_url && (
          <Button asChild variant="outline" size="sm" className="gap-1">
            <a
              href={event.source_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`View source at ${event.source_name}`}
            >
              <ExternalLink className="h-3.5 w-3.5" /> View Source
            </a>
          </Button>
        )}
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to={`/dashboard/ai?symbol=${encodeURIComponent(event.symbol)}`}>
            <Sparkles className="h-3.5 w-3.5" /> Ask AI Analyst
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to={`/dashboard/watchlist?symbol=${encodeURIComponent(event.symbol)}`}>
            Open Watchlist
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to={`/dashboard/journal?symbol=${encodeURIComponent(event.symbol)}`}>
            <NotebookPen className="h-3.5 w-3.5" /> Log in Journal
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to={`/stocks/${encodeURIComponent(event.symbol)}`}>
            <LineChart className="h-3.5 w-3.5" /> Open Chart
          </Link>
        </Button>
      </div>
    </Card>
  );
}
