import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Search, Sun, Moon, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthModals } from "@/components/auth/AuthModals";
import { useTheme } from "@/contexts/ThemeContext";

const EXAMPLE_TICKERS = ["NVDA", "AAPL", "SPY", "QQQ"];

export default function ChartLandingPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [authModal, setAuthModal] = useState<"login" | "signup" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = () => {
    const symbol = query.trim().toUpperCase();
    if (symbol) navigate(`/chart/${symbol}`);
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
        <div className="relative w-full max-w-xl mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Change symbol..."
            className="w-full h-11 pl-9 pr-10 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue/40"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[0.6875rem] text-muted-foreground border border-border rounded px-1.5 py-0.5 font-mono bg-muted/60">
            /
          </kbd>
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
              onClick={() => setTheme("light")}
              className={`flex items-center gap-1 px-3 py-1.5 ${
                theme === "light"
                  ? "bg-accent-blue text-white"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <Sun className="h-3.5 w-3.5" /> Light
            </button>
            <button
              onClick={() => setTheme("dark")}
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
        showLogin={authModal === "login"}
        showSignup={authModal === "signup"}
        onCloseLogin={() => setAuthModal(null)}
        onCloseSignup={() => setAuthModal(null)}
        onSwitchToSignup={() => setAuthModal("signup")}
        onSwitchToLogin={() => setAuthModal("login")}
      />
    </div>
  );
}
