import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function IpoPage({ title, status }: { title: string; status: string }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["ipo-page", status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ipo_list")
        .select("*")
        .eq("status", status)
        .order("ipo_date", { ascending: status === "upcoming" });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-foreground mb-4">{title}</h1>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="fintech-card overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="border-b border-border">
                <th className="table-header text-left px-3 py-2">Date</th>
                <th className="table-header text-left px-3 py-2">Symbol</th>
                <th className="table-header text-left px-3 py-2">Company</th>
                <th className="table-header text-left px-3 py-2 hidden sm:table-cell">Exchange</th>
                <th className="table-header text-left px-3 py-2 hidden sm:table-cell">Price Range</th>
                <th className="table-header text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((ipo) => (
                <tr key={ipo.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-muted-foreground text-xs tabular-nums">
                    {new Date(ipo.ipo_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                  <td className="px-3 py-2">
                    {ipo.symbol ? (
                      <button onClick={() => navigate(`/stocks/${ipo.symbol!.toLowerCase()}`)} className="ticker-symbol text-accent-blue hover:underline text-sm">{ipo.symbol}</button>
                    ) : <span className="text-xs text-muted-foreground">TBD</span>}
                  </td>
                  <td className="px-3 py-2 text-foreground">{ipo.name}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs hidden sm:table-cell">{ipo.exchange ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs hidden sm:table-cell">{ipo.price_range ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      ipo.status === "recent" ? "bg-green-bg text-green" : "bg-accent-blue-light text-accent-blue"
                    )}>
                      {ipo.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function RecentIposPage() { return <IpoPage title="Recent IPOs" status="recent" />; }
export function UpcomingIposPage() { return <IpoPage title="Upcoming IPOs" status="upcoming" />; }
