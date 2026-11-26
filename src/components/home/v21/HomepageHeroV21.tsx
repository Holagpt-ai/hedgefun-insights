import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";
import { trackAuthHandoff, trackPublicDiscoveryNav } from "@/lib/analytics/public-events";
import { searchTickers, EXCHANGE_LABELS, TYPE_LABELS, type SearchResult } from "@/lib/search-tickers";
import { publicStockDetailPath } from "@/lib/public/public-workflow-links";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_HERO_SUBTITLE, PUBLIC_EXTENDED_HOURS_POSITIONING } from "@/lib/public/public-market-copy";
import { AuthModals } from "@/components/auth/AuthModals";
import {
  HOMEPAGE_V21_BASICS_HREF,
  HOMEPAGE_V21_HEADLINE,
} from "@/config/homepage-v21";
import { HomepageSessionChip } from "./HomepageSessionChip";

function useHeroTrending() {
  return useQuery({
    queryKey: ["homepage-hero-trending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocks")
        .select("symbol")
        .not("volume", "is", null)
        .gt("volume", 0)
        .order("volume", { ascending: false })
        .limit(4);
      if (error) throw error;
      return (data ?? []).map((r) => r.symbol).filter(Boolean);
    },
    staleTime: 300_000,
  });
}

export function HomepageHeroV21() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const trendingQuery = useHeroTrending();
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const data = await searchTickers(value);
      setResults(data);
      setShowResults(true);
    }, 200);
  }, []);

  const select = (ticker: string) => {
    trackEvent("stock_search", { ticker, source: "homepage_v21_hero" });
    trackPublicDiscoveryNav({ from: "homepage_hero", to: "stock_detail", symbol: ticker });
    setShowResults(false);
    setQuery("");
    navigate(publicStockDetailPath(ticker));
  };

  const trending = trendingQuery.data ?? [];

  return (
    <section aria-labelledby="homepage-v21-hero-heading" className="mb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 text-left">
          <h1
            id="homepage-v21-hero-heading"
            className="hp-hero-title text-2xl sm:text-3xl text-[var(--hp-ink)]"
          >
            {HOMEPAGE_V21_HEADLINE}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--hp-ink-2)]">{PUBLIC_HERO_SUBTITLE.en}</p>
          <p className="mt-1 max-w-xl text-xs text-[var(--hp-ink-3)]">{PUBLIC_EXTENDED_HOURS_POSITIONING}</p>
          <p className="mt-2 text-sm">
            <Link to={HOMEPAGE_V21_BASICS_HREF} className="font-semibold text-[var(--hp-blue)] hover:underline">
              New here? Start with the basics →
            </Link>
          </p>
        </div>
        <HomepageSessionChip />
      </div>

      <div ref={ref} className="relative mx-auto mt-5 max-w-2xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--hp-ink-3)]" />
        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={(e) => {
            if (!showResults || results.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlightedIndex((i) => (i < results.length - 1 ? i + 1 : 0));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightedIndex((i) => (i > 0 ? i - 1 : results.length - 1));
            } else if (e.key === "Enter" && highlightedIndex >= 0 && results[highlightedIndex]) {
              e.preventDefault();
              select(results[highlightedIndex].ticker);
            }
          }}
          placeholder="Search by ticker or company name"
          className="h-11 border-[var(--hp-line)] bg-[var(--hp-surface)] pl-10 text-base"
          autoComplete="off"
        />
        {showResults && results.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[var(--hp-line)] bg-[var(--hp-surface)] py-1 shadow-lg">
            {results.map((r, i) => (
              <li key={r.ticker}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40 ${
                    i === highlightedIndex ? "bg-muted/50" : ""
                  }`}
                  onClick={() => select(r.ticker)}
                >
                  <span>
                    <span className="font-mono font-bold">{r.ticker}</span>
                    <span className="ml-2 text-[var(--hp-ink-2)]">{r.name}</span>
                  </span>
                  <span className="text-xs text-[var(--hp-ink-3)]">
                    {EXCHANGE_LABELS[r.exchange] ?? r.exchange} · {TYPE_LABELS[r.type] ?? r.type}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {showResults && query.trim() && results.length === 0 && (
          <p className="mt-2 text-sm text-[var(--hp-ink-2)]">No results for &quot;{query}&quot;</p>
        )}
      </div>

      {trending.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <span className="text-xs font-semibold text-[var(--hp-ink-3)]">Trending:</span>
          {trending.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => select(sym)}
              className="rounded-full border border-[var(--hp-line)] bg-[var(--hp-surface)] px-3 py-1 text-xs font-bold text-[var(--hp-blue)] hover:border-[var(--hp-blue)]"
            >
              {sym}
            </button>
          ))}
        </div>
      )}

      {!user && (
        <div className="mt-5 flex justify-center">
          <Button
            className="bg-[var(--hp-blue)] hover:bg-[#0d47a1] font-bold text-white"
            onClick={() => {
              trackAuthHandoff({ mode: "signup", returnPath: "/", source: "homepage_v21_hero" });
              setAuthMode("signup");
            }}
          >
            Create free account
          </Button>
        </div>
      )}
      <AuthModals mode={authMode} onClose={() => setAuthMode(null)} onSwitch={setAuthMode} />
    </section>
  );
}