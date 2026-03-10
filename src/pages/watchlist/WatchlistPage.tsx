import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const WatchlistPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string }[]>([]);

  const { data: watchlist, isLoading } = useQuery({
    queryKey: ["watchlist", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("watchlists")
        .select("*, stocks(symbol, name, price, change_percent, market_cap, pe_ratio, volume)")
        .eq("user_id", user!.id)
        .order("added_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const { error } = await supabase.from("watchlists").insert({ symbol, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("watchlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["watchlist"] }),
  });

  const handleSearch = useCallback(async (value: string) => {
    setSearchQuery(value);
    if (!value.trim()) { setSearchResults([]); return; }
    const { data } = await supabase
      .from("stocks")
      .select("symbol, name")
      .or(`symbol.ilike.%${value}%,name.ilike.%${value}%`)
      .limit(5);
    setSearchResults(data ?? []);
  }, []);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
        <Star className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-bold text-foreground mb-2">Sign in to save your watchlist</h1>
        <p className="text-sm text-muted-foreground mb-6 max-w-sm">
          Create a free account to track your favorite stocks and get personalized alerts.
        </p>
        <div className="flex gap-3">
          <Button className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground" onClick={() => navigate("/signup")}>Sign Up</Button>
          <Button variant="outline" onClick={() => navigate("/login")}>Log In</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-foreground mb-4">My Watchlist</h1>

      {/* Add stock */}
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Add a stock..."
          className="pl-9 h-9 text-sm"
        />
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
            {searchResults.map((r) => (
              <button
                key={r.symbol}
                onClick={() => { addMutation.mutate(r.symbol); setSearchQuery(""); setSearchResults([]); }}
                className="w-full px-4 py-2 flex items-center gap-3 hover:bg-accent text-left text-sm"
              >
                <span className="ticker-symbol text-accent-blue">{r.symbol}</span>
                <span className="text-foreground">{r.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (watchlist ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">Your watchlist is empty. Search for stocks above to add them.</p>
      ) : (
        <div className="fintech-card overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-border">
                <th className="table-header text-left px-3 py-2">Symbol</th>
                <th className="table-header text-left px-3 py-2">Name</th>
                <th className="table-header text-right px-3 py-2">Price</th>
                <th className="table-header text-right px-3 py-2">Change %</th>
                <th className="table-header text-right px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(watchlist ?? []).map((w: any) => {
                const stock = w.stocks;
                return (
                  <tr key={w.id} className="border-b border-border last:border-b-0 hover:bg-accent/50">
                    <td className="px-3 py-2">
                      <button onClick={() => navigate(`/stocks/${w.symbol.toLowerCase()}`)} className="ticker-symbol text-accent-blue hover:underline text-sm">{w.symbol}</button>
                    </td>
                    <td className="px-3 py-2 text-foreground">{stock?.name ?? w.symbol}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{stock?.price ? `$${stock.price.toFixed(2)}` : "—"}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums font-medium", (stock?.change_percent ?? 0) >= 0 ? "price-positive" : "price-negative")}>
                      {stock?.change_percent != null ? `${stock.change_percent >= 0 ? "+" : ""}${stock.change_percent.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeMutation.mutate(w.id)} className="text-muted-foreground hover:text-red">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default WatchlistPage;
