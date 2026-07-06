import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "search_stocks",
  title: "Search stocks",
  description: "Search HedgeFun's stock database by ticker symbol or company name. Returns up to 20 matches with price, sector, and market cap.",
  inputSchema: {
    query: z.string().trim().min(1).describe("Ticker symbol or company name fragment, e.g. 'AAPL' or 'apple'."),
    limit: z.number().int().min(1).max(20).optional().describe("Max results, default 10."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const q = query.trim();
    const { data, error } = await supabase
      .from("stocks")
      .select("symbol,name,price,change_percent,market_cap,sector,exchange")
      .or(`symbol.ilike.${q}%,name.ilike.%${q}%`)
      .limit(limit ?? 10);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { results: data ?? [] },
    };
  },
});
