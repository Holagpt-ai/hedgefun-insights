import { Link } from "react-router-dom";
import type { HoldingsEvidence } from "@/lib/etf/holdings-evidence";

interface Props {
  evidence: HoldingsEvidence;
}

export function EtfHoldingsSection({ evidence }: Props) {
  return (
    <div className="mb-6" data-testid="etf-holdings">
      <h2 className="text-[1rem] font-bold text-foreground mb-2">Top Holdings</h2>
      {evidence.status === "available" ? (
        <>
          <p className="text-xs text-muted-foreground mb-2">
            Source: {evidence.source}
            {evidence.asOf ? ` · As of ${evidence.asOf}` : ""}
          </p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-border bg-muted/30">
                <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground">Symbol</th>
                <th className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground">Company</th>
                <th className="py-2 px-3 text-right text-xs font-semibold text-muted-foreground">Weight %</th>
              </tr>
            </thead>
            <tbody>
              {evidence.holdings.map((holding) => (
                <tr key={holding.symbol} className="border-b border-border hover:bg-muted/50">
                  <td className="py-[7px] px-3">
                    <Link
                      to={`/stocks/${holding.symbol.toLowerCase()}`}
                      className="text-primary font-semibold text-[0.8125rem] hover:underline"
                    >
                      {holding.symbol}
                    </Link>
                  </td>
                  <td className="py-[7px] px-3 text-[0.8125rem] text-foreground">{holding.name ?? "—"}</td>
                  <td className="py-[7px] px-3 text-right text-[0.8125rem] text-foreground tabular-nums">
                    {holding.weightPercent.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="text-sm text-muted-foreground border border-border rounded-[var(--radius)] px-3 py-4">
          Holdings composition unavailable
        </p>
      )}
    </div>
  );
}
