import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getScannerField, type ScannerFieldDefinition } from "@/config/scanner-fields.config";
import { cn } from "@/lib/utils";

function HelpBody({ field }: { field: ScannerFieldDefinition }) {
  return (
    <div className="space-y-2 text-left">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {field.label}
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          What it is
        </div>
        <p className="text-xs text-popover-foreground">{field.description}</p>
      </div>
      {field.whyItMatters ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Why traders watch it
          </div>
          <p className="text-xs text-popover-foreground">{field.whyItMatters}</p>
        </div>
      ) : null}
      {field.example ? (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Example
          </div>
          <p className="text-xs text-popover-foreground">{field.example}</p>
        </div>
      ) : null}
      {field.availability === "unavailable" ? (
        <p className="text-[11px] text-muted-foreground">Unavailable in this sprint — no value is shown.</p>
      ) : null}
    </div>
  );
}

interface ScannerFieldHelpProps {
  fieldId: string;
  children: ReactNode;
  className?: string;
}

/**
 * Desktop: hover/focus on the label. The info glyph stays quiet until hover.
 * Mobile: tap the same control to open the same educational copy.
 */
export function ScannerFieldHelp({ fieldId, children, className }: ScannerFieldHelpProps) {
  const field = getScannerField(fieldId);
  if (!field?.tooltipEnabled) {
    return <span className={className}>{children}</span>;
  }

  return (
    <TooltipProvider delayDuration={250}>
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "group/help inline-flex max-w-full items-center gap-0.5 rounded-sm text-inherit",
                  "hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  className,
                )}
                aria-label={`${field.label} info`}
                onClick={(event) => event.stopPropagation()}
              >
                <span className="truncate">{children}</span>
                <span
                  aria-hidden
                  className="inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40 opacity-0 transition-opacity group-hover/help:opacity-100 group-focus-visible/help:opacity-100"
                />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="hidden max-w-xs md:block">
            <HelpBody field={field} />
          </TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-72 p-3 md:hidden">
          <HelpBody field={field} />
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}
