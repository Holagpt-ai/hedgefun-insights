import { useState } from "react";
import { HelpCircle, Filter, ArrowUpDown, Download, Eye, Star } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    icon: Filter,
    title: "Add & Combine Filters",
    description:
      "Click "Add Filters" to choose from dozens of criteria — market cap, sector, P/E ratio, and more. Combine multiple filters to narrow results to exactly what you're looking for.",
  },
  {
    icon: ArrowUpDown,
    title: "Sort Any Column",
    description:
      "Click a column header to sort ascending or descending. Quickly find the highest market-cap stocks, biggest movers, or lowest P/E ratios.",
  },
  {
    icon: Eye,
    title: "Switch Views",
    description:
      "Use the view tabs (General, Performance, Analysts…) to toggle which data columns appear. Each view surfaces a different angle on the same result set.",
  },
  {
    icon: Star,
    title: "Save to Watchlist",
    description:
      "Spot something interesting? Hit "+ Watchlist" to track it. You can also save an entire filter configuration as a Saved Screen for quick access later.",
  },
  {
    icon: Download,
    title: "Export Results",
    description:
      "Use the Download button to export your filtered results as a CSV for further analysis in a spreadsheet.",
  },
];

interface Props {
  variant?: "stock" | "ipo" | "etf";
}

export function ScreenerTutorialButton({ variant = "stock" }: Props) {
  const [open, setOpen] = useState(false);

  const title =
    variant === "ipo"
      ? "IPO Screener Tutorial"
      : variant === "etf"
        ? "ETF Screener Tutorial"
        : "Stock Screener Tutorial";

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
              Learn how to use the screener to find your next opportunity.
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-4 mt-2">
            {STEPS.map((step, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex-shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold">
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

          <div className="mt-4 flex justify-end">
            <Button size="sm" onClick={() => setOpen(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
