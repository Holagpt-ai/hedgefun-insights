import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useJournalT } from "../i18n";
import type { CalculationState } from "../calc/types";

interface KpiCardProps {
  label: string;
  value: string;
  change?: string | null;
  sampleSize?: number | null;
  definition: string;
  state?: CalculationState | "data-quality";
  tone?: "gain" | "loss" | "warn" | "neutral";
  onDrillDown?: () => void;
}

export function KpiCard({
  label,
  value,
  change,
  sampleSize,
  definition,
  state = "authoritative",
  tone = "neutral",
  onDrillDown,
}: KpiCardProps) {
  const t = useJournalT();
  return (
    <button
      type="button"
      className="journal-kpi text-left w-full"
      onClick={onDrillDown}
      aria-label={`${label}: ${value}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="journal-kpi-label">{label}</div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-muted-foreground" aria-label={t("kpi.definition")}>
              <Info className="h-3 w-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{definition}</TooltipContent>
        </Tooltip>
      </div>
      <div
        className={cn(
          "journal-kpi-value",
          tone === "gain" && "journal-gain",
          tone === "loss" && "journal-loss",
          tone === "warn" && "journal-warn",
        )}
      >
        {value}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {change ? <span>{change} {t("kpi.vsPrior")}</span> : null}
        {sampleSize != null ? <span>{t("kpi.sample")} {sampleSize}</span> : null}
        {state === "incomplete" ? <span className="journal-badge journal-badge-warn">{t("kpi.incomplete")}</span> : null}
        {state === "estimated" ? <span className="journal-badge journal-badge-neu">{t("kpi.estimated")}</span> : null}
        {state === "data-quality" ? <span className="journal-badge journal-badge-warn">{t("overview.dataQuality")}</span> : null}
      </div>
    </button>
  );
}
