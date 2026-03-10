import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

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
      return data;
    },
  });

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        <button onClick={() => navigate(linkTo)} className="text-base text-muted-foreground hover:text-accent-blue">›</button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      ) : (
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
              {(data ?? []).map((ipo) => (
                <tr key={ipo.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 text-muted-foreground tabular-nums text-xs">
                    {new Date(ipo.ipo_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
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
