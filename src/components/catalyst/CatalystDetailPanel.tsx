import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CatalystHandoffs } from "@/components/catalyst/CatalystHandoffs";
import { CatalystHistoricalBehavior } from "@/components/catalyst/CatalystHistoricalBehavior";
import { formatCatalystTimestamp } from "@/components/catalyst/CatalystEventRow";
import {
  CATALYST_CATEGORY_LABEL,
  catalystCategoryBadgeClass,
  liveEventCategory,
} from "@/lib/catalyst/catalyst-event-visuals";
import {
  catalystFreshness,
  type CatalystHistoricalSummary,
} from "@/lib/catalyst/catalyst-historical-facts";
import { EVENT_TYPE_LABEL, formatEpsValue, formatSurprisePct } from "@/lib/catalyst/parsers";
import type { CatalystEvent } from "@/types/catalyst";
import { cn } from "@/lib/utils";

interface CatalystDetailPanelProps {
  event: CatalystEvent | null;
  summary: CatalystHistoricalSummary;
  historyLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nowMs: number;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-border bg-muted/30 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-[12px] font-medium tabular-nums">{value}</div>
    </div>
  );
}

export function CatalystDetailPanel({
  event,
  summary,
  historyLoading,
  open,
  onOpenChange,
  nowMs,
}: CatalystDetailPanelProps) {
  if (!event) return null;
  const category = liveEventCategory(event.event_type);
  const freshness = catalystFreshness(event.published_at, nowMs);
  const facts = event.facts ?? {};
  const estimate = formatEpsValue(facts.estimate_eps);
  const actual = formatEpsValue(facts.actual_eps);
  const surprise = formatSurprisePct(facts.surprise_percent);
  const hasMarketFacts = Boolean(estimate || actual || surprise);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-md"
        data-testid="catalyst-detail-panel"
      >
        <SheetHeader className="space-y-2 text-left">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="text-accent-blue">{event.symbol}</span>
            <Badge
              variant="outline"
              className={cn(
                "h-4 rounded px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide",
                catalystCategoryBadgeClass(category),
              )}
            >
              {EVENT_TYPE_LABEL[event.event_type] ?? CATALYST_CATEGORY_LABEL[category]}
            </Badge>
          </SheetTitle>
          {event.company_name && (
            <p className="text-[12px] text-muted-foreground">{event.company_name}</p>
          )}
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div>
            <div className="break-words text-[14px] font-medium leading-snug">{event.title}</div>
            {event.description && (
              <p className="mt-1 break-words text-[12px] leading-relaxed text-muted-foreground">
                {event.description}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="tabular-nums">{formatCatalystTimestamp(event)}</span>
            <span>Source: {event.source_name}</span>
            <span className="tabular-nums">{freshness.label}</span>
          </div>

          {event.source_url && (
            <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
              <a href={event.source_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" /> View Source
              </a>
            </Button>
          )}

          <section className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Market Facts
            </div>
            {hasMarketFacts ? (
              <div className="grid grid-cols-3 gap-2">
                {estimate && <Fact label="Estimate EPS" value={estimate} />}
                {actual && <Fact label="Actual EPS" value={actual} />}
                {surprise && <Fact label="Surprise" value={surprise} />}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">Market data unavailable</p>
            )}
          </section>

          <CatalystHistoricalBehavior summary={summary} loading={historyLoading} />

          <section className="space-y-2 border-t border-border/60 pt-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Workflow
            </div>
            <CatalystHandoffs symbol={event.symbol} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
