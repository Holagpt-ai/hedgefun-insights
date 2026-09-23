import {
  formatTriggerTimePrimaryLine,
  formatTriggerTimeSecondaryLine,
} from "@/lib/screeners/screener-trigger-time";

interface TriggeredTimeCellProps {
  triggeredAt: string | null | undefined;
  title?: string;
  className?: string;
}

export function TriggeredTimeCell({ triggeredAt, title, className = "" }: TriggeredTimeCellProps) {
  const primary = formatTriggerTimePrimaryLine(triggeredAt);
  const secondary = formatTriggerTimeSecondaryLine(triggeredAt);

  if (primary === "—") {
    return (
      <span className={`tabular-nums text-muted-foreground ${className}`} title={title ?? "Triggered unavailable"}>
        —
      </span>
    );
  }

  return (
    <div className={`tabular-nums ${className}`} title={title}>
      <div className="text-[12px] font-medium text-foreground">{primary}</div>
      {secondary ? (
        <div className="text-[10px] leading-tight text-muted-foreground">{secondary}</div>
      ) : null}
    </div>
  );
}
