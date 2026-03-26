import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const EDGE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/market-data`;

function IpoTable({ title, linkTo, status }: { title: string; linkTo: string; status: string }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["ipos", status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ipo_list")
        .select("*")
        .eq("status", status)
        .order("ipo_date", { ascending: status === "upcoming" })
        .limit(8);
      if (error) throw error;
      if (data && data.length > 0) return data;
      // Fallback to live API
      const ipoStatus = status === "upcoming" ? "pending" : "history";
      const res = await fetch(`${EDGE}?type=ipos&ipoStatus=${ipoStatus}&limit=8`);
      return await res.json();
    },
    staleTime: 300_000,
    retry: 2,
  });

  const isWithin7Days = (dateStr: string) => {
    const diff = new Date(dateStr).getTime() - Date.now();
    return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
  };

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <button onClick={() => navigate(linkTo)} className="text-base text-muted-foreground hover:text-accent-blue">›</button>
      </div>

      {(() => {
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const now = new Date();
        const filtered = (data ?? []).filter((ipo: any) => {
          if (status === "recent") {
            if (!ipo.ipo_date) return false;
            const d = new Date(ipo.ipo_date);
            return d >= ninetyDaysAgo && d <= now;
          }
          if (status === "upcoming") {
            if (!ipo.ipo_date) return true;
            return new Date(ipo.ipo_date) > now;
          }
          return true;
        });

        if (isLoading) return (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded" />
            ))}
          </div>
        );

        return (
          <div className="fintech-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header text-left px-3 py-2">Date</th>
                  <th className="table-header text-left px-3 py-2">Symbol</th>
                  <th className="table-header text-left px-3 py-2">Company Name</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-[0.875rem] text-muted-foreground">
                      {status === "recent" ? "No recent IPOs in the last 90 days." : "No upcoming IPOs scheduled."}
                    </td>
                  </tr>
                ) : filtered.map((ipo: any, idx: number) => (
                <tr key={ipo.id ?? idx} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-muted-foreground tabular-nums text-xs whitespace-nowrap">
                    {ipo.ipo_date ? (
                      <span className="inline-flex items-center gap-1.5">
                        {new Date(ipo.ipo_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {status === "upcoming" && isWithin7Days(ipo.ipo_date) && (
                          <Badge variant="outline" className="text-[0.6rem] px-1 py-0 border-orange-400 text-orange-500 font-semibold">
                            Soon
                          </Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">TBD</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {ipo.symbol ? (
                      <button
                        onClick={() => navigate(`/stocks/${ipo.symbol}`)}
                        className="ticker-symbol text-accent-blue hover:underline text-sm"
                      >
                        {ipo.symbol}
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs">TBD</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-foreground truncate max-w-[200px]">{ipo.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function RecentIpos() {
  return <IpoTable title="Recent IPOs" linkTo="/ipos/recent" status="recent" />;
}

export function UpcomingIpos() {
  return <IpoTable title="Upcoming IPOs" linkTo="/ipos/upcoming" status="upcoming" />;
}
