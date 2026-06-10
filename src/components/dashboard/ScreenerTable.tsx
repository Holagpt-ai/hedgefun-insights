import { Link, useNavigate } from "react-router-dom";
import { ScreenerTab, ColumnFormat } from "@/config/screener-tabs.config";

interface ScreenerTableProps {
  tab: ScreenerTab;
  isPro: boolean;
}

function formatCell(value: string | number, format: ColumnFormat): string {
  if (value === null || value === undefined) return "—";
  switch (format) {
    case "price":
      return `$${Number(value).toFixed(2)}`;
    case "percent": {
      const n = Number(value);
      const sign = n > 0 ? "+" : "";
      return `${sign}${n.toFixed(1)}%`;
    }
    case "multiplier":
      return `${Number(value).toFixed(1)}×`;
    case "volume":
    case "shares": {
      const n = Number(value);
      if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
      if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
      return String(n);
    }
    case "text":
    default:
      return String(value);
  }
}

function percentClass(value: number): string {
  if (value > 0) return "text-green-600";
  if (value < 0) return "text-red-600";
  return "text-foreground";
}

export function ScreenerTable({ tab, isPro }: ScreenerTableProps) {
  const navigate = useNavigate();
  const rows = tab.rows;
  const isFullGate = !isPro && tab.freeRowLimit === 0;
  const visibleCount = isPro ? rows.length : tab.freeRowLimit;

  return (
    <div className="space-y-3">
      {/* Criteria pills + data badge */}
      <div className="flex flex-wrap items-center gap-2">
        {tab.criteria.map((c) => (
          <span
            key={c}
            className="text-[11px] font-medium px-2 py-1 rounded-md bg-muted text-muted-foreground"
          >
            {c}
          </span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isPro ? "bg-green-500 animate-pulse" : "bg-amber-500"
            }`}
          />
          {isPro ? "LIVE DATA" : "DELAYED DATA"}
        </span>
      </div>

      {/* Table */}
      <div className="relative rounded-lg border border-border overflow-hidden bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/50">
              <tr>
                {tab.columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-3 py-2 font-semibold text-muted-foreground text-[11px] uppercase tracking-wide ${
                      col.align === "right" ? "text-right" : "text-left"
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const blurred = !isPro && idx >= visibleCount;
                return (
                  <tr
                    key={idx}
                    className={`border-t border-border ${
                      blurred ? "blur-sm select-none pointer-events-none" : ""
                    }`}
                  >
                    {tab.columns.map((col) => {
                      const raw = row[col.key];
                      const text = formatCell(raw, col.format);
                      const isSymbol = col.key === "symbol";
                      const isPct = col.format === "percent";
                      return (
                        <td
                          key={col.key}
                          className={`px-3 py-2 tabular-nums ${
                            col.align === "right" ? "text-right" : "text-left"
                          } ${isPct ? percentClass(Number(raw)) : ""}`}
                        >
                          {isSymbol ? (
                            <Link
                              to={`/stocks/${raw}`}
                              className="font-semibold text-accent-blue hover:underline"
                            >
                              {text}
                            </Link>
                          ) : (
                            text
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Full-table PRO gate overlay */}
        {isFullGate && (
          <div className="absolute inset-0 backdrop-blur-sm bg-background/70 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <div className="text-2xl">⚡</div>
            <div className="text-sm font-semibold text-foreground">
              {tab.label} — PRO Feature
            </div>
            <div className="text-[12px] text-muted-foreground max-w-sm">
              {tab.description}
            </div>
            <button
              onClick={() => navigate("/pro")}
              className="mt-1 bg-accent-blue text-white text-[13px] font-semibold px-5 py-2 rounded-md hover:opacity-90 transition-opacity duration-200"
            >
              Unlock PRO — $29/month
            </button>
          </div>
        )}
      </div>

      {/* Partial gate prompt */}
      {!isPro && !isFullGate && rows.length > tab.freeRowLimit && (
        <div className="text-center pt-1">
          <button
            onClick={() => navigate("/pro")}
            className="text-[12px] font-semibold text-accent-blue hover:underline"
          >
            Unlock all {rows.length} results with PRO — $29/month →
          </button>
        </div>
      )}
    </div>
  );
}
