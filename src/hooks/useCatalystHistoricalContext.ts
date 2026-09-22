// Async, fail-soft historical enrichment for the Catalyst feed.
// Never blocks the live catalyst rows: the feed renders first and each symbol's
// historical context is merged in as it resolves. Any failure is swallowed and
// the UI falls back to the honest "unavailable" state.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveWorkflowHistoricalContext } from "@/lib/historical-workflow/resolve-workflow-historical-context";
import { readPreloadedRepeatMoverContext } from "@/lib/historical-workflow/workflow-handoff-storage";
import type { RepeatMoverContext } from "@/types/repeat-mover";

const MAX_SYMBOLS = 24;
const CONCURRENCY = 3;

export interface CatalystHistoricalContextState {
  contexts: Record<string, RepeatMoverContext | null>;
  loadingSymbols: Set<string>;
}

async function loadSymbolContext(
  symbol: string,
  accessToken: string | null,
): Promise<RepeatMoverContext | null> {
  try {
    await resolveWorkflowHistoricalContext({
      symbol,
      sourceSurface: "catalyst",
      accessToken: accessToken ?? undefined,
    });
    return readPreloadedRepeatMoverContext(symbol);
  } catch {
    return null;
  }
}

export function useCatalystHistoricalContext(symbols: readonly string[]): CatalystHistoricalContextState {
  const [contexts, setContexts] = useState<Record<string, RepeatMoverContext | null>>({});
  const [loadingSymbols, setLoadingSymbols] = useState<Set<string>>(new Set());
  const requested = useRef<Set<string>>(new Set());
  const key = symbols.slice(0, MAX_SYMBOLS).join(",");

  useEffect(() => {
    const targets = key.split(",").filter((s) => s && !requested.current.has(s));
    if (targets.length === 0) return;
    for (const symbol of targets) requested.current.add(symbol);

    let cancelled = false;
    setLoadingSymbols((prev) => {
      const next = new Set(prev);
      for (const symbol of targets) next.add(symbol);
      return next;
    });

    void (async () => {
      let accessToken: string | null = null;
      try {
        const { data } = await supabase.auth.getSession();
        accessToken = data.session?.access_token ?? null;
      } catch {
        accessToken = null;
      }

      let cursor = 0;
      const worker = async (): Promise<void> => {
        for (;;) {
          const index = cursor++;
          const symbol = targets[index];
          if (!symbol) return;
          const context = await loadSymbolContext(symbol, accessToken);
          if (cancelled) return;
          setContexts((prev) => ({ ...prev, [symbol]: context }));
          setLoadingSymbols((prev) => {
            const next = new Set(prev);
            next.delete(symbol);
            return next;
          });
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()),
      );
    })();

    return () => { cancelled = true; };
  }, [key]);

  return { contexts, loadingSymbols };
}
