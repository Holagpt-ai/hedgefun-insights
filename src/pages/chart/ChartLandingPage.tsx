import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Search, Sun, Moon, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModals } from "@/components/auth/AuthModals";
import { useTheme } from "@/contexts/ThemeContext";
import { searchTickers, EXCHANGE_LABELS, type SearchResult } from "@/lib/search-tickers";

const EXAMPLE_TICKERS = ["NVDA", "AAPL", "SPY", "QQQ"];

export default function ChartLandingPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [authModal, setAuthModal] = useState<"login" | "signup" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  /* Global "/" shortcut */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [results]);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); setShowResults(false); setIsSearching(false); return; }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      const data = await searchTickers(value);
      setResults(data);
      setShowResults(true);
      setIsSearching(false);
    }, 200);
  }, []);

  const selectResult = (r: SearchResult) => {
    setShowResults(false);
    setQuery("");
    setHighlightedIndex(-1);
    navigate(`/chart/${r.ticker.toUpperCase()}`);
  };

  const handleSubmit = () => {
    if (highlightedIndex >= 0 && results[highlightedIndex]) {
      selectResult(results[highlightedIndex]);
      return;
    }
    const symbol = query.trim().toUpperCase();
    if (symbol) navigate(`/chart/${symbol}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (!showResults || results.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((i) => (i < results.length - 1 ? i + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((i) => (i > 0 ? i - 1 : results.length - 1));
        break;
      case "Escape":
        setShowResults(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground text-center mb-4">
          Technical Analysis Stock Charts
        </h1>
        <p className="text-muted-foreground text-center max-w-lg mb-10 text-[0.9375rem] leading-relaxed">
          Search for a stock symbol to view an interactive chart with technical
          indicators, drawing tools, and comparison features.
        </p>

        {/* Search input */}
        <div ref={containerRef} className="relative w-full max-w-xl mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            onKeyDown={handleKeyDown}
            placeholder="Change symbol..."
            className="w-full h-11 pl-9 pr-10 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue/40"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[0.6875rem] text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono bg-muted/60">
            /
          </kbd>

          {showResults && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
              {results.map((r, index) => (
                <button
                  key={r.ticker}
                  onClick={() => selectResult(r)}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 transition-colors text-left border-b border-border last:border-0 ${
                    index === highlightedIndex ? "bg-accent" : "hover:bg-accent"
                  }`}
                >
                  <span className="text-sm font-semibold text-accent-blue">{r.ticker}</span>
                  <span className="text-sm text-foreground truncate flex-1">{r.name}</span>
                  <span className="text-[0.6875rem] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {EXCHANGE_LABELS[r.exchange ?? ""] ?? r.exchange ?? "—"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {showResults && results.length === 0 && query.trim().length >= 1 && !isSearching && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg z-50 px-4 py-3 text-sm text-muted-foreground">
              No results for "{query}"
            </div>
          )}
          {isSearching && query.trim().length >= 1 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg z-50 px-4 py-3 text-sm text-muted-foreground">
              Searching...
            </div>
          )}
        </div>

        {/* Example tickers */}
        <p className="text-sm text-muted-foreground">
          Examples:{" "}
          {EXAMPLE_TICKERS.map((t, i) => (
            <span key={t}>
              <Link
                to={`/chart/${t}`}
                className="text-accent-blue hover:underline font-medium"
              >
                {t}
              </Link>
              {i < EXAMPLE_TICKERS.length - 1 && ", "}
            </span>
          ))}
        </p>
      </div>

      {/* ── Right sidebar (desktop only) ── */}
      <aside className="hidden lg:flex flex-col w-[280px] border-l border-border bg-background p-6 shrink-0">
        {/* Watchlist CTA */}
        <div className="flex-1">
          <h2 className="text-base font-bold text-foreground mb-2">
            Get your watchlists here
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed mb-6">
            Log in or create a free account to see your watchlists in this
            sidebar. This makes it easy to quickly toggle between charts.
          </p>

          <Button
            className="w-full mb-3"
            onClick={() => setAuthModal("login")}
          >
            Log In
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setAuthModal("signup")}
          >
            Create Free Account
          </Button>
        </div>

        {/* Theme toggle */}
        <div className="border border-border rounded-md p-3 flex items-center justify-between mt-6">
          <span className="text-sm font-medium text-foreground">Theme</span>
          <div className="flex rounded-md overflow-hidden border border-border text-sm">
            <button
              onClick={() => theme !== "light" && toggleTheme()}
              className={`flex items-center gap-1 px-3 py-1.5 ${
                theme === "light"
                  ? "bg-accent-blue text-white"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <Sun className="h-3.5 w-3.5" /> Light
            </button>
            <button
              onClick={() => theme !== "dark" && toggleTheme()}
              className={`flex items-center gap-1 px-3 py-1.5 ${
                theme === "dark"
                  ? "bg-accent-blue text-white"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <Lock className="h-3.5 w-3.5" /> Dark
            </button>
          </div>
        </div>
      </aside>

      {/* Auth modals */}
      <AuthModals
        mode={authModal}
        onClose={() => setAuthModal(null)}
        onSwitch={setAuthModal}
      />
    </div>
  );
}
