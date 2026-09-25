import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ScannerMetricHintProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * One compact hint for scanner metric headers and blank cells.
 * Desktop: hover or focus. Mobile: tap or focus. The cell value stays —.
 */
export function ScannerMetricHint({ label, children, className }: ScannerMetricHintProps) {
  return (
    <TooltipProvider delayDuration={250}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "inline-flex max-w-full items-center rounded-sm text-inherit",
                  "hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  className,
                )}
                aria-label={typeof children === "string" ? `${children}. ${label}` : label}
                onClick={(event) => event.stopPropagation()}
              >
                <span className="truncate">{children}</span>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="hidden max-w-xs text-xs md:block">
            {label}
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-64 p-2 text-xs md:hidden">
          {label}
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

export function HintedMetric({
  text,
  blankHint,
  className,
}: {
  text: string;
  blankHint?: string;
  className?: string;
}) {
  if (text === "—" && blankHint) {
    return (
      <ScannerMetricHint label={blankHint} className={className}>
        —
      </ScannerMetricHint>
    );
  }
  return <span className={className}>{text}</span>;
}
