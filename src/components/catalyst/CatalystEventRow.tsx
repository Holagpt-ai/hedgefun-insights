import { Bookmark, BookmarkCheck, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CATALYST_CATEGORY_LABEL,
  catalystCategoryBadgeClass,
  liveEventCategory,
} from "@/lib/catalyst/catalyst-event-visuals";
import {
  catalystFreshness,
  catalystHistoricalBadgeLabel,
  type CatalystHistoricalSummary,
} from "@/lib/catalyst/catalyst-historical-facts";
import { EVENT_TYPE_LABEL, timeOfDayLabel } from "@/lib/catalyst/parsers";
import { CatalystHandoffs } from "@/components/catalyst/CatalystHandoffs";
import type { CatalystEvent } from "@/types/catalyst";
import { cn } from "@/lib/utils";

export function formatCatalystTimestamp(event: CatalystEvent): string {
  const iso = event.published_at ?? event.event_time;
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    }
  }
  if (event.event_date) {
    const parsed = new Date(`${event.event_date}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  }
  return timeOfDayLabel(event.time_of_day) ?? "Time unavailable";
}

interface CatalystEventRowProps {
  event: CatalystEvent;
  summary: CatalystHistoricalSummary;
  historyLoading: boolean;
  isSaved: boolean;
  isReviewed: boolean;
  onOpen: () => void;
  onToggleSaved: () => void;
  onToggleReviewed: () => void;
  disabled?: boolean;
  nowMs: number;
}

export function CatalystEventRow({
  event,
  summary,
  historyLoading,
  isSaved,
  isReviewed,
  onOpen,
  onToggleSaved,
  onToggleReviewed,
  disabled,
  nowMs,
}: CatalystEventRowProps) {
  const category = liveEventCategory(event.event_type);
  const freshness = catalystFreshness(event.published_at, nowMs);
  const historyBadge = catalystHistoricalBadgeLabel(summary);

  return (
    <Card
      role="button"
      tabIndex={0}
      data-testid="catalyst-event-row"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "cursor-pointer p-3 transition-colors hover:border-accent-blue/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-blue",
        isReviewed && "opacity-80",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold text-accent-blue">{event.symbol}</span>
            {event.company_name && (
              <span className="max-w-[240px] truncate text-[12px] text-muted-foreground">
                {event.company_name}
              </span>
            )}
            <Badge
              variant="outline"
              className={cn(
                "h-4 rounded px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide",
                catalystCategoryBadgeClass(category),
              )}
            >
              {EVENT_TYPE_LABEL[event.event_type] ?? CATALYST_CATEGORY_LABEL[category]}
            </Badge>
            {historyBadge && (
              <Badge
                variant="outline"
                className="h-4 rounded px-1.5 py-0 text-[9px] font-semibold normal-case tracking-normal text-accent-blue"
              >
                {historyBadge}
              </Badge>
            )}
            {freshness.stale && (
              <Badge
                variant="outline"
                className="h-4 rounded px-1.5 py-0 text-[9px] font-medium normal-case tracking-normal text-muted-foreground"
              >
                {freshness.label}
              </Badge>
            )}
          </div>

          <div className="mt-1 break-words text-[13px] font-medium leading-snug">
            {event.title}
          </div>

          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums">{formatCatalystTimestamp(event)}</span>
            <span>Source: {event.source_name}</span>
            {!freshness.stale && <span className="tabular-nums">{freshness.label}</span>}
            {historyLoading && !summary.available && <span>Historical context loading…</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={disabled}
            aria-label={isSaved ? "Unsave event" : "Save event"}
            onClick={(e) => { e.stopPropagation(); onToggleSaved(); }}
          >
            {isSaved ? (
              <BookmarkCheck className="h-3.5 w-3.5 text-accent-blue" />
            ) : (
              <Bookmark className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={disabled}
            aria-label={isReviewed ? "Undo reviewed" : "Mark reviewed"}
            onClick={(e) => { e.stopPropagation(); onToggleReviewed(); }}
          >
            <Eye className={cn("h-3.5 w-3.5", isReviewed && "text-emerald-600")} />
          </Button>
        </div>
      </div>

      <div className="mt-2 border-t border-border/60 pt-2">
        <CatalystHandoffs symbol={event.symbol} />
      </div>
    </Card>
  );
}
