import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  buildSecProvenanceView,
  isSecEdgarCatalystRow,
} from "@/lib/catalyst/sec-edgar-events";
import type { CatalystEvent } from "@/types/catalyst";

export function CatalystSecProvenance({
  event,
  nowMs,
  variant,
}: {
  event: CatalystEvent;
  nowMs: number;
  variant: "compact" | "full";
}) {
  if (!isSecEdgarCatalystRow(event.provider)) return null;
  const view = buildSecProvenanceView(event, nowMs);

  if (variant === "compact") {
    return (
      <div className="mt-1.5 min-w-0 space-y-1" data-testid="sec-provenance-compact">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="h-4 rounded px-1.5 py-0 text-[9px] font-semibold uppercase tracking-wide"
          >
            {view.formLabel}
          </Badge>
          {view.attribution.confidence !== "unavailable" && (
            <Badge
              variant="outline"
              className="h-4 max-w-full truncate rounded px-1.5 py-0 text-[9px] font-medium normal-case tracking-normal text-muted-foreground"
            >
              {view.attribution.statusLabel}
            </Badge>
          )}
        </div>
        <div className="flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>{view.filingDateLabel}</span>
          <span>{view.acceptedAtLabel}</span>
          <span>{view.itemsLabel}</span>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-2" data-testid="sec-provenance">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        SEC filing
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
          {view.formLabel}
        </Badge>
        <Badge
          variant="outline"
          className="text-[10px] font-medium normal-case tracking-normal text-muted-foreground"
        >
          {view.attribution.statusLabel}
        </Badge>
      </div>
      <dl className="grid gap-1 text-[12px]">
        <div className="grid grid-cols-[108px_1fr] gap-2">
          <dt className="text-muted-foreground">Form / items</dt>
          <dd className="min-w-0 break-words text-foreground/90">
            {view.formType ?? "Form unavailable"}
            {" · "}
            {view.itemsLabel}
          </dd>
        </div>
        <div className="grid grid-cols-[108px_1fr] gap-2">
          <dt className="text-muted-foreground">Filing date</dt>
          <dd className="min-w-0 break-words text-foreground/90">{view.filingDateLabel}</dd>
        </div>
        <div className="grid grid-cols-[108px_1fr] gap-2">
          <dt className="text-muted-foreground">SEC accepted</dt>
          <dd className="min-w-0 break-words text-foreground/90">{view.acceptedAtLabel}</dd>
        </div>
        <div className="grid grid-cols-[108px_1fr] gap-2">
          <dt className="text-muted-foreground">Attribution</dt>
          <dd className="min-w-0 break-words text-foreground/90">{view.attribution.statusLabel}</dd>
        </div>
      </dl>
      {view.sourceUrl ? (
        <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
          <a
            href={view.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="sec-filing-source"
            aria-label={`Original SEC filing at ${view.sourceName}`}
            onClick={(click) => click.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" /> Original SEC filing
          </a>
        </Button>
      ) : (
        <p className="text-[12px] text-muted-foreground" data-testid="sec-filing-source-missing">
          SEC filing source unavailable
        </p>
      )}
      {view.verifiedSignals.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-muted-foreground" data-testid="sec-relevance-signals">
          {view.verifiedSignals.map((signal) => (
            <li key={signal.id}>{signal.label}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
