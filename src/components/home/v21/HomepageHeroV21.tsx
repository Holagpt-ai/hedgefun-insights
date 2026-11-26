import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";
import { trackAuthHandoff, trackPublicDiscoveryNav } from "@/lib/analytics/public-events";
import { searchTickers, EXCHANGE_LABELS, TYPE_LABELS, type SearchResult } from "@/lib/search-tickers";
import { publicStockDetailPath } from "@/lib/public/public-workflow-links";
import { PUBLIC_HERO_SUBTITLE, PUBLIC_EXTENDED_HOURS_POSITIONING } from "@/lib/public/public-market-copy";
import { AuthModals } from "@/components/auth/AuthModals";
import { HOMEPAGE_V21_BASICS_HREF } from "@/config/homepage-v21";
import { useHomepageTrending } from "@/hooks/useHomepageTrending";
import { useLanguage } from "@/contexts/LanguageContext";
import { homepageV21Copy, type HomepageV21Lang } from "@/lib/homepage/homepage-v21-copy";
import { getEffectiveLanguage } from "@/config/locale-v1.policy";
import { useLocation } from "react-router-dom";

export function HomepageHeroV21() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { language } = useLanguage();
  const lang = getEffectiveLanguage(language, pathname) as HomepageV21Lang;
  const copy = homepageV21Copy(lang);
  const trendingQuery = useHomepageTrending(4);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [searchMsg, setSearchMsg] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestGen = useRef(0);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setSearchMsg("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setShowResults(false);
      setIsSearching(false);
      return;
    }
    const gen = ++requestGen.current;
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchTickers(value);
        if (gen !== requestGen.current) return;
        setResults(data);
        setShowResults(true);
        if (data.length === 0) {
          setSearchMsg(`${copy.searchNoResults} "${value.trim()}"`);
        }
      } finally {
        if (gen === requestGen.current) setIsSearching(false);
      }
    }, 200);
  }, [copy.searchNoResults]);

  const select = (ticker: string) => {
    trackEvent("stock_search", { ticker, source: "homepage_v21_hero" });
    trackPublicDiscoveryNav({ from: "homepage_hero", to: "stock_detail", symbol: ticker });
    setShowResults(false);
    setQuery("");
    setSearchMsg("");
    navigate(publicStockDetailPath(ticker));
  };

  const submitSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (highlightedIndex >= 0 && results[highlightedIndex]) {
      select(results[highlightedIndex].ticker);
      return;
    }
    if (results.length === 1) {
      select(results[0].ticker);
      return;
    }
    if (results.length > 0) {
      select(results[0].ticker);
      return;
    }
    setSearchMsg(`${copy.searchNoResults} "${q}"`);
  };

  const trending = trendingQuery.data?.slice(0, 4) ?? [];

  return (
    <section aria-labelledby="homepage-v21-hero-heading" className="hp-hero text-center">
      <h1
        id="homepage-v21-hero-heading"
        className="hp-hero-title mx-auto max-w-3xl text-[clamp(1.5rem,3vw,2rem)] text-[var(--hp-ink)]"
      >
        {copy.heroTitlePrefix}{" "}
        <em className="font-semibold not-italic text-[var(--hp-blue)]">{copy.heroTitleEmphasis}</em>
      </h1>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--hp-ink-2)]">{copy.heroSub}</p>
      <p className="mx-auto mt-1 max-w-2xl text-xs text-[var(--hp-ink-3)]">{PUBLIC_HERO_SUBTITLE[lang]}</p>
      <p className="mx-auto mt-1 max-w-2xl text-[11px] text-[var(--hp-ink-3)]">
        {PUBLIC_EXTENDED_HOURS_POSITIONING}
      </p>

      <div ref={ref} className="relative mx-auto mt-5 w-full max-w-3xl">
        <form className="hp-hero-search-row flex flex-col gap-2 sm:flex-row sm:items-stretch" onSubmit={submitSearch}>
          <div className="hp-hero-search-box relative flex flex-1 items-center gap-2 rounded-xl border border-[var(--hp-line)] bg-[var(--hp-surface)] px-3 py-1.5 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-[var(--hp-ink-3)]" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={(e) => {
                if (!showResults || results.length === 0) {
                  if (e.key === "Enter") submitSearch();
                  return;
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlightedIndex((i) => (i < results.length - 1 ? i + 1 : 0));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlightedIndex((i) => (i > 0 ? i - 1 : results.length - 1));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  submitSearch();
                } else if (e.key === "Escape") {
                  setShowResults(false);
                }
              }}
              placeholder={copy.heroSearchPlaceholder}
              aria-label={copy.heroSearchPlaceholder}
              className="min-h-10 w-full bg-transparent text-sm outline-none"
              autoComplete="off"
            />
            <button type="submit" className="hp-btn hp-btn-blue shrink-0 rounded-lg px-4 py-2 text-sm font-bold">
              {copy.heroSearchButton}
            </button>
          </div>
          {!user && (
            <button
              type="button"
              className="hp-btn hp-btn-blue create-btn2 shrink-0 rounded-lg px-4 py-2 text-sm font-bold sm:min-w-[11rem]"
              onClick={() => {
                trackAuthHandoff({ mode: "signup", returnPath: "/", source: "homepage_v21_hero" });
                setAuthMode("signup");
              }}
            >
              {copy.heroCreateAccount}
            </button>
          )}
        </form>

        {showResults && results.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full max-w-3xl overflow-auto rounded-lg border border-[var(--hp-line)] bg-[var(--hp-surface)] py-1 text-left shadow-lg">
            {results.map((r, i) => (
              <li key={r.ticker}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted/40 ${
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

        <p className="hero-trend mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-[var(--hp-ink-3)]">{copy.trendingLabel}</span>
          {trending.map((row) => (
            <button
              key={row.symbol}
              type="button"
              className="t-chip rounded-full border border-[var(--hp-line)] bg-[var(--hp-surface)] px-3 py-0.5 text-xs font-bold text-[var(--hp-blue)]"
              onClick={() => select(row.symbol)}
            >
              {row.symbol}
            </button>
          ))}
          <Link to={HOMEPAGE_V21_BASICS_HREF} className="text-xs font-semibold text-[var(--hp-blue)] hover:underline">
            {copy.basicsLink}
          </Link>
        </p>
        <p className="mt-2 text-xs text-[var(--hp-ink-2)]" aria-live="polite">
          {isSearching ? copy.searchSearching : searchMsg}
        </p>
      </div>
      <AuthModals mode={authMode} onClose={() => setAuthMode(null)} onSwitch={setAuthMode} />
    </section>
  );
}