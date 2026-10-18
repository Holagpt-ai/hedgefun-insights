import type { FundDetailRow } from "@/lib/etf/fund-metrics";

interface Props {
  description: string | null;
  descriptionKind: "profile" | "provider" | "none";
  rows: FundDetailRow[];
}

export function EtfFundOverview({ description, descriptionKind, rows }: Props) {
  const caption = descriptionKind === "profile"
    ? "Descriptive fund profile. Not a live holdings or valuation feed."
    : descriptionKind === "provider"
      ? "Provider description."
      : null;

  return (
    <div className="mb-6 space-y-4" data-testid="etf-fund-overview">
      <div>
        <h2 className="text-[1rem] font-bold text-foreground mb-2">About This Fund</h2>
        {caption && <p className="text-xs text-muted-foreground mb-1">{caption}</p>}
        {description ? (
          <p className="text-[0.8125rem] text-muted-foreground leading-relaxed">{description}</p>
        ) : (
          <p className="text-[0.8125rem] text-muted-foreground">Fund description unavailable.</p>
        )}
      </div>

      <div>
        <h2 className="text-[1rem] font-bold text-foreground mb-2">Fund Details</h2>
        <div className="border border-border rounded-[var(--radius)] overflow-hidden">
          {rows.map((row, index) => (
            <div
              key={row.label}
              className={`flex items-center justify-between gap-3 px-3 py-2 text-[0.8125rem] ${
                index % 2 === 0 ? "bg-muted/30" : ""
              }`}
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span className="text-foreground font-medium text-right">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
