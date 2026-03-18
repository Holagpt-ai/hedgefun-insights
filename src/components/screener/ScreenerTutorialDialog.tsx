import { useState } from "react";
import { HelpCircle, SlidersHorizontal, Table2, MousePointerClick, BookmarkPlus, Lightbulb } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: SlidersHorizontal,
    title: "Set Your Filters",
    description:
      "Click 'Filters' to expand the filter panel. Choose criteria like Market Cap, P/E Ratio, Sector, Exchange, Price Range, and % Change. Add as many filters as needed.",
  },
  {
    icon: Table2,
    title: "Browse Results",
    description:
      "The table updates automatically as you adjust filters. Results are sorted by Market Cap by default. Click any column header to re-sort.",
  },
  {
    icon: MousePointerClick,
    title: "Click a Stock to Dive Deeper",
    description:
      "Click any ticker symbol (shown in blue) to open the full stock detail page with financials, charts, news, and more.",
  },
  {
    icon: BookmarkPlus,
    title: "Save or Export Your Screen",
    description:
      "Use 'Popular Screens' for preset filters, or save your custom screen with 'Saved Screens' (Pro feature).",
  },
];

interface Props {
  variant?: "stock" | "ipo" | "etf";
}

export function ScreenerTutorialButton({ variant = "stock" }: Props) {
  const [open, setOpen] = useState(false);

  const title =
    variant === "ipo"
      ? "How to Use the IPO Screener"
      : variant === "etf"
        ? "How to Use the ETF Screener"
        : "How to Use the Stock Screener";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-sm text-accent-blue hover:underline"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        Screener Tutorial
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Learn how to filter, sort, and explore stocks like a pro.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-4 mt-2">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex-shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-accent-blue text-primary-foreground text-xs font-bold">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <step.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {step.title}
                  </p>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1.5">
            <Lightbulb className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            Tip: Use the 'Find' search box to locate a specific symbol within your current results.
          </p>

          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={() => setOpen(false)} className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground">
              Start Screening →
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
