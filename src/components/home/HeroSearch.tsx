import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { trackEvent } from "@/lib/analytics";
import { useLanguage } from "@/contexts/LanguageContext";
import { searchTickers, EXCHANGE_LABELS, TYPE_LABELS, type SearchResult } from "@/lib/search-tickers";

const TRENDING = [
  { symbol: "NVDA", label: "NVDA" },
  { symbol: "MSFT", label: "MSFT" },
  { symbol: "PLTR", label: "PLTR" },
  { symbol: "HIMS", label: "HIMS" },
];

export function HeroSearch() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
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

  const select = (ticker: string) => {
    trackEvent("stock_search", { ticker });
    setShowResults(false);
    setQuery("");
    setHighlightedIndex(-1);
    navigate(`/stocks/${ticker.toLowerCase()}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && results[highlightedIndex]) {
          select(results[highlightedIndex].ticker);
        }
        break;
      case "Escape":
        setShowResults(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  return (
    <div className="bg-surface px-4 py-8 md:py-10 text-center">
      <h2 className="text-[1.375rem] md:text-[1.75rem] font-bold text-foreground leading-tight">
        {t("heroTitle")}
      </h2>
      <p className="mt-2 text-sm text-text-secondary max-w-[520px] mx-auto">
        {t("heroSubtitle")}
      </p>

      <div ref={ref} className="relative max-w-[560px] mx-auto mt-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          onKeyDown={handleKeyDown}
          placeholder={t("searchPlaceholder")}
          className="pl-9 h-11 text-sm bg-surface-card border-border"
        />
        {showResults && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
            {results.map((r, index) => (
              <button
                key={r.ticker}
                onClick={() => select(r.ticker)}
                className={`w-full px-4 py-2.5 flex items-center gap-3 transition-colors text-left border-b border-border last:border-0 ${
                  index === highlightedIndex ? "bg-accent" : "hover:bg-accent"
                }`}
              >
                <span className="ticker-symbol text-accent-blue text-sm font-semibold">{r.ticker}</span>
                <span className="text-sm text-foreground truncate flex-1">{r.name}</span>
                <span className="text-[0.6875rem] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {EXCHANGE_LABELS[r.exchange ?? ""] ?? r.exchange ?? "—"}
                </span>
                <span className="text-[0.6875rem] text-muted-foreground">
                  {TYPE_LABELS[r.type ?? ""] ?? r.type ?? "Stock"}
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

      <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">{t("trendingLabel")}</span>
        {TRENDING.map((t) => (
          <button
            key={t.symbol}
            onClick={() => select(t.symbol)}
            className="text-xs font-medium text-accent-blue hover:underline"
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => navigate("/trending")}
          className="text-xs font-medium text-muted-foreground border border-border rounded-full px-2.5 py-0.5 hover:border-accent-blue hover:text-accent-blue transition-colors"
        >
          More →
        </button>
      </div>
    </div>
  );
}
