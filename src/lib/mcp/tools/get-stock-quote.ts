import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_stock_quote",
  title: "Get stock quote",
  description: "Fetch the latest cached quote and fundamentals for a single ticker symbol from HedgeFun's stock database.",
  inputSchema: {
    symbol: z.string().trim().min(1).max(10).describe("Ticker symbol, e.g. 'AAPL'."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ symbol }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data, error } = await supabase
      .from("stocks")
      .select("*")
      .ilike("symbol", symbol.trim())
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: `No quote found for ${symbol}` }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { quote: data },
    };
  },
});
