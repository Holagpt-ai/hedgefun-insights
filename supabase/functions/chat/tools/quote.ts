import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ToolDefinition, ToolHandler, ToolResult } from "./types.ts";

// --- get_quote ---

export const getQuoteDefinition: ToolDefinition = {
  name: "get_quote",
  description:
    "Retrieves the current/today's price quote for a specific stock ticker: open, high, low, close (or current price if the market is open), volume, and change percent. Use this for ANY question about a stock's price, OHLC, today's move, or current quote. Do not estimate or recall prices from training data — always call this tool for price questions.",
  input_schema: {
    type: "object",
    properties: {
      ticker: {
        type: "string",
        description: "The stock ticker symbol, e.g. NNBR, AAPL.",
      },
    },
    required: ["ticker"],
  },
};

export const getQuoteHandler: ToolHandler = async (
  _userId: string,
  _supabase: SupabaseClient,
  params: Record<string, unknown>
): Promise<ToolResult> => {
  const ticker =
    typeof params.ticker === "string" ? params.ticker.trim().toUpperCase() : "";

  if (!ticker) {
    return { content: "No ticker provided.", isError: true };
  }

  const apiKey = Deno.env.get("POLYGON_API_KEY");
  if (!apiKey) {
    return { content: "Quote data unavailable.", isError: true };
  }

  try {
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(
      ticker
    )}?apiKey=${apiKey}`;

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) {
      console.error("[get_quote] Polygon error:", res.status);
      return {
        content: `Quote data unavailable for ${ticker} (status ${res.status}). Ticker may be invalid.`,
        isError: true,
      };
    }

    const json = await res.json();
    const t = json?.ticker;

    if (!t) {
      return { content: `No quote data found for ${ticker}.`, isError: true };
    }

    const day = t.day ?? {};
    const prevDay = t.prevDay ?? {};
    const usingPrevDay = !day.o && !day.c;

    const source = usingPrevDay ? prevDay : day;

    const quote = {
      ticker,
      open: source.o ?? null,
      high: source.h ?? null,
      low: source.l ?? null,
      close: source.c ?? null,
      volume: source.v ?? null,
      change_percent: t.todaysChangePerc ?? null,
      last_price: t.lastTrade?.p ?? source.c ?? null,
      is_previous_close: usingPrevDay,
      note: usingPrevDay
        ? "Market has not traded today yet (or is closed) — this is the most recent previous close, not today's data."
        : "Today's intraday data (delayed ~15 min).",
    };

    return { content: JSON.stringify(quote) };
  } catch (e) {
    console.error("[get_quote] exception:", e);
    return { content: `Quote data unavailable for ${ticker}.`, isError: true };
  }
};
