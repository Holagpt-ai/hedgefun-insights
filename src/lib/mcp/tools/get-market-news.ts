import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_market_news",
  title: "Get market news",
  description: "Return the most recent market news headlines from HedgeFun, optionally filtered by category.",
  inputSchema: {
    category: z.enum(["markets", "stocks", "ipo", "etf", "general"]).optional().describe("Optional news category filter."),
    limit: z.number().int().min(1).max(50).optional().describe("Max headlines, default 15."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category, limit }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    let q = supabase
      .from("market_news")
      .select("headline,source,url,category,published_at")
      .order("published_at", { ascending: false })
      .limit(limit ?? 15);
    if (category) q = q.eq("category", category);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { news: data ?? [] },
    };
  },
});
