import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { useLanguage } from "@/contexts/LanguageContext";

const TRENDING = [
  { symbol: "NVDA", label: "NVDA" },
  { symbol: "MSFT", label: "MSFT" },
  { symbol: "PLTR", label: "PLTR" },
  { symbol: "HIMS", label: "HIMS" },
];

export function HeroSearch() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ symbol: string; name: string; exchange: string | null }[]>([]);
  const [showResults, setShowResults] = useState(false);
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
    if (!value.trim()) { setResults([]); setShowResults(false); return; }
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from("stocks")
        .select("symbol, name, exchange")
        .or(`symbol.ilike.%${value}%,name.ilike.%${value}%`)
        .limit(8);
      setResults(data ?? []);
      setShowResults(true);
    }, 200);
  }, []);

  const select = (symbol: string) => {
    trackEvent("stock_search", { ticker: symbol });
    setShowResults(false);
    setQuery("");
    navigate(`/stocks/${symbol}`);
  };

  return (
    <div className="bg-surface px-4 py-8 md:py-10 text-center">
      <h2 className="text-[1.375rem] md:text-[1.75rem] font-bold text-foreground leading-tight">
        Search for a stock to start your analysis
      </h2>
      <p className="mt-2 text-sm text-text-secondary max-w-[520px] mx-auto">
        Get real-time prices, financials, news, and analysis for any stock.
      </p>

      <div ref={ref} className="relative max-w-[560px] mx-auto mt-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder={t("searchPlaceholder")}
          className="pl-9 h-11 text-sm bg-surface-card border-border"
        />
        {showResults && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
            {results.map((r) => (
              <button
                key={r.symbol}
                onClick={() => select(r.symbol)}
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-accent transition-colors text-left"
              >
                <span className="ticker-symbol text-accent-blue text-sm">{r.symbol}</span>
                <span className="text-sm text-foreground truncate flex-1">{r.name}</span>
                {r.exchange && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{r.exchange}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Trending:</span>
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
