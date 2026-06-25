import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Gamepad2,
  Trophy,
  Loader2,
  Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchTickers } from "@/lib/search-tickers";

const SEASON_ID = "f324285d-8619-4188-9255-c1666b21ccb9";

interface Season {
  id: string;
  name: string;
  status: "upcoming" | "active" | "closed";
  starts_at: string;
  ends_at: string;
  prize_description: string;
}

interface Portfolio {
  id: string;
  cash_balance: number;
  total_value: number;
  realized_pnl: number;
  unrealized_pnl: number;
  rank: number | null;
  joined_at: string;
}

interface LeaderboardEntry {
  rank: number;
  display_name: string;
  total_value: number;
  total_pnl: number;
  pnl_pct: number;
  position_count: number;
  user_id: string;
}

interface Position {
  id: string;
  symbol: string;
  shares: number;
  avg_cost_price: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
}

interface GameTrade {
  id: string;
  action: "buy" | "sell";
  symbol: string;
  shares: number;
  price_at_execution: number;
  total_value: number;
  executed_at: string;
}

interface TickerSearchResult {
  ticker: string;
  name: string;
  exchange: string | null;
  type: string | null;
}

type View = "lobby" | "portfolio" | "leaderboard";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const fmtFull = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function HedgeFunGame() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<View>("lobby");
  const [loading, setLoading] = useState(true);
  const [season, setSeason] = useState<Season | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerCount, setPlayerCount] = useState(0);

  const [displayName, setDisplayName] = useState("");
  const [joining, setJoining] = useState(false);

  const [positions, setPositions] = useState<Position[]>([]);
  const [trades, setTrades] = useState<GameTrade[]>([]);
  const [positionsLoading, setPositionsLoading] = useState(false);

  // Buy interface state
  const [buyQuery, setBuyQuery] = useState("");
  const [buyResults, setBuyResults] = useState<TickerSearchResult[]>([]);
  const [buySearching, setBuySearching] = useState(false);
  const [selectedBuyTicker, setSelectedBuyTicker] = useState<string | null>(null);
  const [buyShares, setBuyShares] = useState("");
  const [tradeLoading, setTradeLoading] = useState(false);
  const [showBuyResults, setShowBuyResults] = useState(false);

  // Sell interface state
  const [sellSymbol, setSellSymbol] = useState<string | null>(null);
  const [sellShares, setSellShares] = useState("");

  const buyDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function init() {
      setLoading(true);
      const { data: s } = await supabase
        .from("game_seasons")
        .select("id, name, status, starts_at, ends_at, prize_description")
        .eq("id", SEASON_ID)
        .maybeSingle();

      const { count } = await supabase
        .from("game_portfolios")
        .select("id", { count: "exact", head: true })
        .eq("season_id", SEASON_ID);

      const { data: p } = await supabase
        .from("game_portfolios")
        .select(
          "id, cash_balance, total_value, realized_pnl, unrealized_pnl, rank, joined_at"
        )
        .eq("season_id", SEASON_ID)
        .eq("user_id", user!.id)
        .maybeSingle();

      const { data: lb } = await supabase
        .from("game_leaderboard")
        .select(
          "rank, display_name, total_value, total_pnl, pnl_pct, position_count, user_id"
        )
        .eq("season_id", SEASON_ID)
        .order("rank", { ascending: true })
        .limit(10);

      if (cancelled) return;
      setSeason((s as Season | null) ?? null);
      setPlayerCount(count ?? 0);
      setPortfolio((p as Portfolio | null) ?? null);
      setLeaderboard((lb as LeaderboardEntry[] | null) ?? []);
      setView(p ? "portfolio" : "lobby");
      setLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (view !== "leaderboard") return;
    let cancelled = false;
    async function fetchFull() {
      const { data } = await supabase
        .from("game_leaderboard")
        .select(
          "rank, display_name, total_value, total_pnl, pnl_pct, position_count, user_id"
        )
        .eq("season_id", SEASON_ID)
        .order("rank", { ascending: true });
      if (cancelled) return;
      setLeaderboard((data as LeaderboardEntry[] | null) ?? []);
    }
    fetchFull();
    return () => {
      cancelled = true;
    };
  }, [view]);

  async function handleJoin() {
    if (!user) return;
    const name = displayName.trim();
    if (name.length < 2 || name.length > 20) {
      toast.error("Display name must be 2–20 characters");
      return;
    }
    if (!/^[a-zA-Z0-9 _]+$/.test(name)) {
      toast.error("Display name: letters, numbers, spaces, underscores only");
      return;
    }
    setJoining(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const { data, error } = await supabase.functions.invoke("game-join", {
      body: { season_id: SEASON_ID, display_name: name },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? "Failed to join. Try again.");
      setJoining(false);
      return;
    }
    toast.success("You're in! Good luck 🎯");
    const { data: p } = await supabase
      .from("game_portfolios")
      .select(
        "id, cash_balance, total_value, realized_pnl, unrealized_pnl, rank, joined_at"
      )
      .eq("season_id", SEASON_ID)
      .eq("user_id", user.id)
      .maybeSingle();
    setPortfolio((p as Portfolio | null) ?? null);
    setPlayerCount((c) => c + 1);
    setView("portfolio");
    setJoining(false);
  }

  async function loadPortfolioData() {
    if (!user) return;
    setPositionsLoading(true);
    const [{ data: pos }, { data: tr }] = await Promise.all([
      supabase
        .from("game_positions")
        .select("id, symbol, shares, avg_cost_price, current_price, market_value, unrealized_pnl")
        .eq("season_id", SEASON_ID)
        .eq("user_id", user.id)
        .gt("shares", 0),
      supabase
        .from("game_trades")
        .select("id, action, symbol, shares, price_at_execution, total_value, executed_at")
        .eq("season_id", SEASON_ID)
        .eq("user_id", user.id)
        .order("executed_at", { ascending: false })
        .limit(50),
    ]);
    setPositions((pos as Position[] | null) ?? []);
    setTrades((tr as GameTrade[] | null) ?? []);
    setPositionsLoading(false);
  }

  useEffect(() => {
    if (view === "portfolio" && portfolio) {
      loadPortfolioData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, portfolio?.id]);

  const handleBuySearch = useCallback((value: string) => {
    setBuyQuery(value);
    setSelectedBuyTicker(null);
    if (buyDebounceRef.current) clearTimeout(buyDebounceRef.current);
    if (!value.trim()) {
      setBuyResults([]);
      setShowBuyResults(false);
      return;
    }
    setBuySearching(true);
    buyDebounceRef.current = setTimeout(async () => {
      const data = await searchTickers(value);
      setBuyResults(data as TickerSearchResult[]);
      setShowBuyResults(true);
      setBuySearching(false);
    }, 200);
  }, []);

  async function handleTrade(action: "buy" | "sell", symbol: string, sharesRaw: string) {
    if (!user) return;
    const shares = parseInt(sharesRaw, 10);
    if (isNaN(shares) || shares < 100) {
      toast.error("Minimum 100 shares per trade");
      return;
    }
    setTradeLoading(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    const { data, error } = await supabase.functions.invoke("game-trade", {
      body: { action, symbol: symbol.toUpperCase(), shares, season_id: SEASON_ID },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? "Trade failed. Try again.");
      setTradeLoading(false);
      return;
    }
    toast.success(`${action === "buy" ? "Bought" : "Sold"} ${shares} shares of ${symbol.toUpperCase()}`);
    const { data: p } = await supabase
      .from("game_portfolios")
      .select("id, cash_balance, total_value, realized_pnl, unrealized_pnl, rank, joined_at")
      .eq("season_id", SEASON_ID)
      .eq("user_id", user.id)
      .maybeSingle();
    setPortfolio((p as Portfolio | null) ?? null);
    await loadPortfolioData();
    setSelectedBuyTicker(null);
    setBuyQuery("");
    setBuyShares("");
    setSellSymbol(null);
    setSellShares("");
    setTradeLoading(false);
  }


  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
        <Gamepad2 className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Sign in to play HedgeFun Game.</p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!season) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
        <Trophy className="h-10 w-10 text-muted-foreground" />
        <h2 className="text-xl font-semibold">No Active Season</h2>
        <p className="text-muted-foreground">Check back soon for the next season.</p>
      </div>
    );
  }

  const statusLabel =
    season.status === "active"
      ? "● Live"
      : season.status === "upcoming"
      ? "Upcoming"
      : "Closed";

  const statusClass =
    season.status === "active"
      ? "bg-[hsl(var(--green))]/10 text-[hsl(var(--green))]"
      : season.status === "upcoming"
      ? "bg-accent/30 text-foreground"
      : "bg-muted text-muted-foreground";

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Gamepad2 className="h-7 w-7 text-foreground" />
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
          HedgeFun Game
        </h1>
        <span
          className={`text-xs font-medium px-2 py-1 rounded-full ${statusClass}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-border">
        {([
          { key: "lobby", label: "Overview" },
          { key: "portfolio", label: "My Portfolio" },
          { key: "leaderboard", label: "Leaderboard" },
        ] as { key: View; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`px-4 py-2 text-sm font-medium transition-colors relative ${
              view === key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {view === key && (
              <span className="absolute bottom-[-1px] left-0 right-0 h-[2px] bg-foreground" />
            )}
          </button>
        ))}
      </div>

      {view === "lobby" && (
        <LobbyView
          season={season}
          portfolio={portfolio}
          playerCount={playerCount}
          leaderboard={leaderboard}
          displayName={displayName}
          setDisplayName={setDisplayName}
          joining={joining}
          handleJoin={handleJoin}
          onViewPortfolio={() => setView("portfolio")}
          onViewLeaderboard={() => setView("leaderboard")}
          currentUserId={user.id}
        />
      )}

      {view === "portfolio" && (
        <>
          {portfolio ? (
            <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
              <p>Portfolio view coming in next prompt</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border p-8 text-center space-y-4">
              <p className="text-muted-foreground">
                You haven't joined this season yet.
              </p>
              <Button onClick={() => setView("lobby")}>Join Now →</Button>
            </div>
          )}
        </>
      )}

      {view === "leaderboard" && (
        <LeaderboardView
          season={season}
          leaderboard={leaderboard}
          currentUserId={user.id}
        />
      )}
    </div>
  );
}

function LobbyView({
  season,
  portfolio,
  playerCount,
  leaderboard,
  displayName,
  setDisplayName,
  joining,
  handleJoin,
  onViewPortfolio,
  onViewLeaderboard,
  currentUserId,
}: {
  season: Season;
  portfolio: Portfolio | null;
  playerCount: number;
  leaderboard: LeaderboardEntry[];
  displayName: string;
  setDisplayName: (v: string) => void;
  joining: boolean;
  handleJoin: () => void;
  onViewPortfolio: () => void;
  onViewLeaderboard: () => void;
  currentUserId: string;
}) {
  const closed = season.status === "closed";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left column */}
      <div className="rounded-lg border border-border p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">{season.name}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {fmtDate(season.starts_at)} – {fmtDate(season.ends_at)}
          </p>
        </div>

        <div className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md bg-accent/30">
          🏆 <span className="font-medium">Prize:</span> {season.prize_description}
        </div>

        <div className="space-y-2 text-sm">
          <p>
            <span className="font-medium">{playerCount}</span>{" "}
            <span className="text-muted-foreground">players joined</span>
          </p>
          <p className="text-muted-foreground">
            Virtual $5,000,000 starting balance · Everyone starts equal
          </p>
          <p className="text-xs text-muted-foreground">
            Prices delayed 15 min (Polygon Starter)
          </p>
        </div>

        <div className="pt-2 border-t border-border">
          {closed ? (
            <p className="text-sm text-muted-foreground">This season has ended.</p>
          ) : portfolio ? (
            <div className="space-y-3">
              <p className="text-sm text-[hsl(var(--green))] font-medium">
                You're in!
              </p>
              <Button onClick={onViewPortfolio}>View your portfolio →</Button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-medium">
                Choose your display name
              </label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. TradingWolf99"
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground">
                2–20 chars · letters, numbers, spaces, underscores
              </p>
              <Button
                onClick={handleJoin}
                disabled={joining || closed}
                className="w-full sm:w-auto"
              >
                {joining ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Joining…
                  </>
                ) : (
                  <>Join {season.name}</>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Right column */}
      <div className="rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Current Standings</h3>
        </div>

        {leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground">Be the first to join!</p>
        ) : (
          <div className="divide-y divide-border">
            <div className="grid grid-cols-12 text-xs uppercase tracking-wide text-muted-foreground py-2">
              <div className="col-span-1">#</div>
              <div className="col-span-6">Player</div>
              <div className="col-span-3 text-right">Value</div>
              <div className="col-span-2 text-right">P&L %</div>
            </div>
            {leaderboard.map((row) => {
              const isMe = row.user_id === currentUserId;
              const pnlClass =
                row.pnl_pct >= 0
                  ? "text-[hsl(var(--green))]"
                  : "text-[hsl(var(--red))]";
              return (
                <div
                  key={row.user_id}
                  className={`grid grid-cols-12 py-2 text-sm items-center ${
                    isMe ? "bg-accent/20 rounded" : ""
                  }`}
                >
                  <div className="col-span-1 font-semibold">#{row.rank}</div>
                  <div className="col-span-6 truncate">{row.display_name}</div>
                  <div className="col-span-3 text-right tabular-nums">
                    {fmt(row.total_value)}
                  </div>
                  <div className={`col-span-2 text-right tabular-nums ${pnlClass}`}>
                    {row.pnl_pct >= 0 ? "+" : ""}
                    {row.pnl_pct.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Button variant="outline" onClick={onViewLeaderboard} className="w-full">
          View Full Leaderboard →
        </Button>
      </div>
    </div>
  );
}

function LeaderboardView({
  season,
  leaderboard,
  currentUserId,
}: {
  season: Season;
  leaderboard: LeaderboardEntry[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {season.name} · 🏆 {season.prize_description}
      </div>

      {leaderboard.length === 0 ? (
        <div className="rounded-lg border border-border p-8 text-center text-muted-foreground">
          No players yet. Be the first to join!
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3">Rank</th>
                <th className="text-left px-4 py-3">Player</th>
                <th className="text-right px-4 py-3">Portfolio Value</th>
                <th className="text-right px-4 py-3">P&L ($)</th>
                <th className="text-right px-4 py-3">P&L (%)</th>
                <th className="text-right px-4 py-3">Positions</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row) => {
                const isMe = row.user_id === currentUserId;
                const pnlClass =
                  row.total_pnl >= 0
                    ? "text-[hsl(var(--green))]"
                    : "text-[hsl(var(--red))]";
                const pctClass =
                  row.pnl_pct >= 0
                    ? "text-[hsl(var(--green))]"
                    : "text-[hsl(var(--red))]";
                return (
                  <tr
                    key={row.user_id}
                    className={`border-t border-border ${
                      isMe ? "border-l-2 border-l-accent-blue bg-accent/10" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-semibold">#{row.rank}</td>
                    <td className="px-4 py-3 truncate max-w-[200px]">
                      {row.display_name}
                      {isMe && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (you)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtFull(row.total_value)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${pnlClass}`}>
                      {row.total_pnl >= 0 ? "+" : ""}
                      {fmtFull(row.total_pnl)}
                    </td>
                    <td className={`px-4 py-3 text-right tabular-nums ${pctClass}`}>
                      {row.pnl_pct >= 0 ? "+" : ""}
                      {row.pnl_pct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.position_count}
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
}
