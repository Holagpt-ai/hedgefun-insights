import { Link } from "react-router-dom";

export function StockHistoricalRadarLink({ ticker }: { ticker: string }) {
  const sym = ticker.trim().toUpperCase();
  if (!sym) return null;
  const params = new URLSearchParams({ symbol: sym, focus: "historical" });
  return (
    <div className="rounded-lg border bg-card/50 px-3 py-2 text-[11px]">
      <span className="text-muted-foreground">Historical episodes: </span>
      <Link
        to={`/dashboard/screeners?${params.toString()}`}
        className="font-medium text-accent-blue hover:underline"
      >
        Open in Day Trade Radar
      </Link>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Compare prior momentum sessions using stored Stocksist evidence (not live replay or predictions).
      </p>
    </div>
  );
}
