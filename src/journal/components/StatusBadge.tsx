import { cn } from "@/lib/utils";
import { useJournalT, type JournalMessageKey } from "../i18n";
import type { Outcome, TradeStatus } from "../calc/types";

type BadgeTone = "gain" | "loss" | "warn" | "neu" | "brand";

export function StatusBadge({
  status,
  outcome,
  label,
  tone,
}: {
  status?: TradeStatus;
  outcome?: Outcome;
  label?: string;
  tone?: BadgeTone;
}) {
  const t = useJournalT();
  const text = label
    ?? (status ? t(`status.${status}` as JournalMessageKey) : outcome ? t(`outcome.${outcome}` as JournalMessageKey) : "");
  const resolved: BadgeTone = tone ?? (
    outcome === "win" || status === "closed" ? "gain"
      : outcome === "loss" ? "loss"
        : status === "open" || status === "partially_closed" ? "brand"
          : outcome === "breakeven" || status === "planned" ? "warn"
            : "neu"
  );
  return (
    <span className={cn("journal-badge", `journal-badge-${resolved}`)}>{text}</span>
  );
}
