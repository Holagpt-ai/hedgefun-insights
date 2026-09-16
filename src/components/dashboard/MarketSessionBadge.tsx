import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useExtendedSessionBadgeState } from "@/hooks/useExtendedSessionBadgeState";
import {
  extendedSessionBadgeLabel,
  extendedSessionBadgeTooltip,
} from "@/lib/extended-session-badge";

const BADGE_CLASS =
  "ml-auto inline-flex shrink-0 items-center rounded-full border px-1 py-px text-[8px] font-semibold uppercase leading-none tracking-tight whitespace-nowrap";

export function MarketSessionBadge() {
  const state = useExtendedSessionBadgeState();
  if (!state) return null;

  const label = extendedSessionBadgeLabel(state);
  const tooltip = extendedSessionBadgeTooltip(state);
  const sessionClass =
    state === "pre_market"
      ? "border-accent-blue/25 bg-accent-blue-light text-accent-blue"
      : "border-violet-200/80 bg-violet-50 text-violet-700 dark:border-violet-700/40 dark:bg-violet-950/40 dark:text-violet-300";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            data-testid="market-session-badge"
            data-session={state}
            className={cn(
              BADGE_CLASS,
              sessionClass,
              "motion-safe:animate-session-badge-breathe motion-reduce:animate-none",
            )}
          >
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
