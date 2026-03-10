import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const EarningsPage = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["earnings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("earnings_calendar")
        .select("*")
        .order("report_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Group by date
  const grouped = (data ?? []).reduce<Record<string, typeof data>>((acc, item) => {
    const date = item.report_date;
    if (!acc[date]) acc[date] = [];
    acc[date]!.push(item);
    return acc;
  }, {});

  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-foreground mb-4">Earnings Calendar</h1>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-sm text-muted-foreground">No earnings data available yet.</p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date}>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                {new Date(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </h3>
              <div className="fintech-card overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="table-header text-left px-3 py-2">Symbol</th>
                      <th className="table-header text-left px-3 py-2">Company</th>
                      <th className="table-header text-right px-3 py-2">EPS Est.</th>
                      <th className="table-header text-right px-3 py-2">EPS Actual</th>
                      <th className="table-header text-right px-3 py-2">Surprise %</th>
                      <th className="table-header text-left px-3 py-2">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(items ?? []).map((e) => (
                      <tr key={e.id} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-2">
                          <button onClick={() => navigate(`/stocks/${e.symbol.toLowerCase()}`)} className="ticker-symbol text-accent-blue hover:underline text-sm">{e.symbol}</button>
                        </td>
                        <td className="px-3 py-2 text-foreground">{e.company_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{e.estimate_eps?.toFixed(2) ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{e.actual_eps?.toFixed(2) ?? "—"}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums font-medium", (e.surprise_percent ?? 0) >= 0 ? "price-positive" : "price-negative")}>
                          {e.surprise_percent != null ? `${e.surprise_percent >= 0 ? "+" : ""}${e.surprise_percent.toFixed(1)}%` : "—"}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{e.time_of_day ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EarningsPage;
