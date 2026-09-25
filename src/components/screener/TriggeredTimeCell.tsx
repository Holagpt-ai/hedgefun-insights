import {
  formatTriggerTimePrimaryLine,
  formatTriggerTimeSecondaryLine,
} from "@/lib/screeners/screener-trigger-time";
import { formatElapsedAge } from "@/lib/screeners/elapsed-age";
import { useScannerNowMs } from "@/lib/screeners/scanner-clock";

interface TriggeredTimeCellProps {
  triggeredAt: string | null | undefined;
  title?: string;
  className?: string;
}

export function TriggeredTimeCell({ triggeredAt, title, className = "" }: TriggeredTimeCellProps) {
  const nowMs = useScannerNowMs();
  const primary = formatTriggerTimePrimaryLine(triggeredAt);
  const secondary = formatTriggerTimeSecondaryLine(triggeredAt);
  const age = primary === "—" ? null : formatElapsedAge(triggeredAt, nowMs);

  if (primary === "—") {
    return (
      <span className={`tabular-nums text-muted-foreground ${className}`} title={title ?? "Triggered unavailable"}>
        —
      </span>
    );
  }

  return (
    <div className={`whitespace-nowrap tabular-nums ${className}`} title={title}>
      <div className="text-[12px] font-medium text-foreground">{primary}</div>
      {secondary ? (
        <div className="text-[10px] leading-tight text-muted-foreground">{secondary}</div>
      ) : null}
      {age ? (
        <div
          data-testid="trigger-elapsed-age"
          className="text-[10px] leading-tight text-sky-800/70 dark:text-sky-300/70"
        >
          {age}
        </div>
      ) : null}
    </div>
  );
}
