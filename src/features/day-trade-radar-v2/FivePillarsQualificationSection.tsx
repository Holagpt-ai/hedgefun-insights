import type { FivePillarsTransparencyView } from "@/lib/day-trade/five-pillars-transparency";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";

const STATUS_CLASS: Record<string, string> = {
  PASS: "text-emerald-700 dark:text-emerald-400",
  FAIL: "text-destructive",
  GRACE: "text-amber-700 dark:text-amber-400",
  MISSING: "text-muted-foreground",
};

interface FivePillarsQualificationSectionProps {
  view: FivePillarsTransparencyView | null;
}

export function FivePillarsQualificationSection({ view }: FivePillarsQualificationSectionProps) {
  if (!view) return null;

  const observedLine = formatEtClock(view.providerAsOf);

  return (
    <section
      className="rounded-md border border-border bg-muted/20 px-3 py-2 space-y-2"
      data-testid="five-pillars-qualification"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Five Pillars
          </div>
          <div className="text-[13px] font-semibold text-foreground">{view.lifecycleTitle}</div>
        </div>
        <div className="text-[11px] text-muted-foreground tabular-nums">{view.compactSummary}</div>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{view.lifecycleDetail}</p>
      {observedLine ? (
        <p className="text-[10px] text-muted-foreground">
          Scanner observation {observedLine} ET · 15-minute delayed market data
        </p>
      ) : (
        <p className="text-[10px] text-muted-foreground">Scanner observation time unavailable</p>
      )}

      <details className="group text-[11px]">
        <summary className="cursor-pointer select-none font-semibold text-accent-blue">
          Pillar evidence
        </summary>
        <ul className="mt-2 space-y-2">
          {view.pillars.map((pillar) => (
            <li
              key={pillar.key}
              className="rounded border border-border/60 bg-background/80 px-2 py-1.5"
              data-testid={`five-pillar-${pillar.key}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{pillar.label}</span>
                <span className={`font-semibold uppercase tracking-wide ${STATUS_CLASS[pillar.status] ?? ""}`}>
                  {pillar.status}
                </span>
              </div>
              <div className="mt-0.5 text-muted-foreground">
                Observed <span className="tabular-nums text-foreground">{pillar.observed}</span>
                {" · "}
                Required <span className="text-foreground">{pillar.threshold}</span>
              </div>
              {pillar.observationAt ? (
                <div className="text-[10px] text-muted-foreground">
                  As of {formatEtClock(pillar.observationAt) ?? pillar.observationAt} ET
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10px] text-muted-foreground">{view.gracePolicyNote}</p>
      </details>
    </section>
  );
}
