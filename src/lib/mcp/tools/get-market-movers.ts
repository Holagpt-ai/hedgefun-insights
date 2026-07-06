import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_market_movers",
  title: "Get market movers",
  description: "List today's top market movers (gainers, losers, most active, pre-market, or after-hours) from HedgeFun's data.",
  inputSchema: {
    type: z.enum(["gainer", "loser", "active", "premarket", "afterhours"]).describe("Which mover category to return."),
    limit: z.number().int().min(1).max(50).optional().describe("Max results, default 10."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ type, limit }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data, error } = await supabase
      .from("market_movers")
      .select("symbol,name,price,change_percent,volume,type,session_date")
      .eq("type", type)
      .order("change_percent", { ascending: type === "loser" })
      .limit(limit ?? 10);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { movers: data ?? [] },
    };
  },
});
