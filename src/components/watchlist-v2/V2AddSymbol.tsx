import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { searchTickers, EXCHANGE_LABELS, type SearchResult } from "@/lib/search-tickers";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;

interface Props {
  onAdd: (symbol: string) => void;
  disabled?: boolean;
  /** Optional handoff symbol — prefills and focuses the input; user still must click Add. */
  initialSymbol?: string | null;
  compact?: boolean;
}

/**
 * Add-symbol control backed by the existing global stock autocomplete
 * (`searchTickers` + `ticker_search` fallback). No new backend endpoint.
 */
export function V2AddSymbol({ onAdd, disabled, initialSymbol, compact }: Props) {
  const [val, setVal] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!initialSymbol) return;
    const t = initialSymbol.trim().toUpperCase();
    if (!SYMBOL_RE.test(t)) return;
    setVal(t);
    queueMicrotask(() => inputRef.current?.focus());
  }, [initialSymbol]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runSearch = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setOpen(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        let data = await searchTickers(value);
        if (!data || data.length === 0) {
          const q = value.trim();
          const { data: rows } = await supabase
            .from("ticker_search")
            .select("symbol, name, exchange, type")
            .or(`symbol.ilike.${q.toUpperCase()}%,name.ilike.%${q}%`)
            .eq("active", true)
            .order("symbol")
            .limit(10);
          data = (rows ?? []).map((r) => ({
            ticker: r.symbol,
            name: r.name,
            exchange: r.exchange,
            type: r.type,
          }));
        }
        setResults(data);
        setOpen(true);
      } catch {
        setResults([]);
        setOpen(true);
      }
      setSearching(false);
    }, 200);
  }, []);

  const submitSymbol = (raw: string) => {
    const t = raw.trim().toUpperCase();
    if (!SYMBOL_RE.test(t)) return;
    onAdd(t);
    setVal("");
    setResults([]);
    setOpen(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (results.length === 1) {
      submitSymbol(results[0].ticker);
      return;
    }
    submitSymbol(val);
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <div ref={wrapRef} className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={val}
          onChange={(e) => {
            const next = e.target.value;
            setVal(next);
            runSearch(next);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={compact ? "Add symbol…" : "Search name or symbol…"}
          maxLength={64}
          className={cn("h-9 pl-8", compact ? "w-[160px] sm:w-[200px]" : "w-[200px] sm:w-[240px]")}
          aria-label="Add ticker"
          autoComplete="off"
        />
        {open && (results.length > 0 || searching || val.trim().length >= 1) && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden max-h-[280px] overflow-y-auto min-w-[260px]">
            {searching && (
              <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
            )}
            {!searching && results.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No results for &ldquo;{val}&rdquo;
              </div>
            )}
            {results.map((r) => (
              <button
                key={r.ticker}
                type="button"
                onClick={() => submitSymbol(r.ticker)}
                className="w-full px-3 py-2 flex items-center gap-2 hover:bg-accent text-left text-sm"
              >
                <span className="font-semibold text-accent-blue text-xs tabular-nums w-14 shrink-0">
                  {r.ticker}
                </span>
                <span className="text-foreground truncate flex-1 text-xs">{r.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {EXCHANGE_LABELS[r.exchange ?? ""] ?? r.exchange ?? ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Button type="submit" size="sm" disabled={disabled || !val.trim()} className="h-9">
        <Plus className="h-4 w-4 mr-1" /> Add
      </Button>
    </form>
  );
}
