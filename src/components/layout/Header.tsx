import { useState, useEffect, useRef, useCallback } from "react";
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
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { trackEvent } from "@/lib/analytics";

interface SearchResult {
  symbol: string;
  name: string;
  exchange: string | null;
}

export function Header({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { user, profile, signOut } = useAuth();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // "/" keyboard shortcut to focus search
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

  // Click outside to close results
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
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
      const { data } = await supabase
        .from("stocks")
        .select("symbol, name, exchange")
        .or(`symbol.ilike.%${value}%,name.ilike.%${value}%`)
        .limit(8);
      setResults(data ?? []);
      setShowResults(true);
    }, 200);
  }, []);

  const selectResult = (r: SearchResult) => {
    trackEvent("stock_search", { ticker: r.symbol });
    setShowResults(false);
    setQuery("");
    navigate(`/stocks/${r.symbol}`);
  };

  const initials = profile?.full_name
    ? profile.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <header className="sticky top-0 z-40 flex h-header items-center border-b border-border bg-surface-card px-4 gap-3">
      {/* Mobile: menu toggle */}
      <button onClick={onMenuToggle} className="md:hidden flex items-center justify-center" aria-label="Menu">
        <Menu className="h-5 w-5 text-foreground" />
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0 cursor-pointer" onClick={() => navigate("/")}>
        <div className="h-8 w-8 rounded-md bg-accent-blue flex items-center justify-center">
          <span className="text-sm font-bold text-primary-foreground">HF</span>
        </div>
        <span className="hidden md:block font-display text-lg text-foreground">HedgeFun</span>
      </div>

      {/* Search */}
      <div ref={searchRef} className="relative flex-1 max-w-full md:max-w-[480px] mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          placeholder={t("searchPlaceholder")}
          className="pl-9 h-9 bg-surface border-border text-sm"
        />
        {showResults && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
            {results.map((r) => (
              <button
                key={r.symbol}
                onClick={() => selectResult(r)}
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

      {/* Desktop right actions */}
      <div className="hidden md:flex items-center gap-2">
        {/* Language toggle */}
        <button
          onClick={() => setLanguage(language === "en" ? "es" : "en")}
          className="text-xs font-medium text-muted-foreground hover:text-foreground bg-muted rounded-full px-2.5 py-1 transition-colors"
        >
          {language === "en" ? "EN" : "ES"} | {language === "en" ? "ES" : "EN"}
        </button>

        {/* Theme toggle */}
        <Button variant="ghost" size="icon" onClick={toggleTheme} className="h-8 w-8">
          {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-8 w-8 rounded-full bg-gradient-to-br from-accent-blue to-accent-blue-hover flex items-center justify-center text-xs font-bold text-primary-foreground">
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate("/watchlist")}>
                <Star className="mr-2 h-4 w-4" /> {t("myWatchlist")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/account")}>
                <Settings className="mr-2 h-4 w-4" /> {t("accountSettings")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/account/billing")}>
                <CreditCard className="mr-2 h-4 w-4" /> {t("manageBilling")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" /> {t("signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>{t("logIn")}</Button>
            <Button size="sm" className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground" onClick={() => navigate("/signup")}>{t("signUp")}</Button>
          </>
        )}
      </div>
    </header>
  );
}
