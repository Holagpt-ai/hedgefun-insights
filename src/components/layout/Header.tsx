import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Menu, Sun, Moon, User, LogOut, Settings, Star, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { AuthModals } from "@/components/auth/AuthModals";
import { trackEvent } from "@/lib/analytics";
import { useEffect, useRef, useCallback } from "react";
import { searchTickers, EXCHANGE_LABELS, TYPE_LABELS, type SearchResult } from "@/lib/search-tickers";

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { user, profile, signOut } = useAuth();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
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
    trackEvent("stock_search", { ticker: r.ticker });
    setShowResults(false);
    setQuery("");
    setHighlightedIndex(-1);
    navigate(`/stocks/${r.ticker.toLowerCase()}`);
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
          selectResult(results[highlightedIndex]);
        }
        break;
      case "Escape":
        setShowResults(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url;
  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <>
      <header className="sticky top-0 z-40 flex h-header items-center border-b border-border bg-surface-card px-4 gap-3">
        <button onClick={onMenuToggle} className="md:hidden flex items-center justify-center" aria-label="Menu">
          <Menu className="h-5 w-5 text-foreground" />
        </button>

        <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => navigate("/")}>
          <div className="h-8 w-8 rounded-md bg-accent-blue flex items-center justify-center">
            <span className="text-sm font-bold text-primary-foreground">HF</span>
          </div>
          <span className="hidden md:block font-display text-lg text-foreground">HedgeFun</span>
        </div>

        <div ref={searchRef} className="relative flex-1 max-w-full md:max-w-[480px] mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => results.length > 0 && setShowResults(true)}
            onKeyDown={handleKeyDown}
            placeholder={t("searchPlaceholder")}
            className="pl-9 h-9 bg-surface border-border text-sm"
          />
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

        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={() => setLanguage(language === "en" ? "es" : "en")}
            className="text-xs font-medium text-muted-foreground hover:text-foreground bg-muted rounded-full px-2.5 py-1 transition-colors"
          >
            {language === "en" ? "EN" : "ES"} | {language === "en" ? "ES" : "EN"}
          </button>

          <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8">
            {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </Button>

          {user !== null ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {avatarUrl ? (
                  <button className="h-8 w-8 rounded-full overflow-hidden ring-2 ring-border">
                    <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <button className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-blue to-accent-blue-hover flex items-center justify-center text-xs font-bold text-primary-foreground">
                    {initials}
                  </button>
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate("/watchlist")}>
                  <Star className="mr-2 h-4 w-4" /> My Watchlist
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/account")}>
                  <Settings className="mr-2 h-4 w-4" /> Account Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/account/billing")}>
                  <CreditCard className="mr-2 h-4 w-4" /> Manage Billing
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setAuthMode("login")}>Log In</Button>
              <Button size="sm" className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground" onClick={() => setAuthMode("signup")}>Sign Up</Button>
            </>
          )}
        </div>
      </header>

      <AuthModals
        mode={authMode}
        onClose={() => setAuthMode(null)}
        onSwitch={setAuthMode}
      />
    </>
  );
}
