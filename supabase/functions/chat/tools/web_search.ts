import type { ToolDefinition, ToolHandler, ToolResult } from "./types.ts";

export const webSearchDefinition: ToolDefinition = {
  name: "web_search",
  description:
    "Searches the web for current information. Use for: trading regulations, PDT rule changes, margin requirements, broker policies, recent market news, earnings dates, IPO filings, or anything that may have changed recently. Always include the current year in regulatory queries. Synthesize results and cite sources. Add verify with your broker for regulatory answers.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query. Include 2026 for regulatory or rule-based questions.",
      },
    },
    required: ["query"],
  },
};

export const webSearchHandler: ToolHandler = async (
  _userId: string,
  _supabase: unknown,
  params: Record<string, unknown>
): Promise<ToolResult> => {
  const query = typeof params.query === "string" ? params.query : "";
  if (!query) return { content: "No search query provided.", isError: true };

  const apiKey = Deno.env.get("BRAVE_API_KEY");
  if (!apiKey) return { content: "Web search unavailable.", isError: true };

  try {
    const endpoint = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&search_lang=en`;
    const res = await fetch(endpoint, {
      headers: {
        "Accept": "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": apiKey,
      },
    });

    if (!res.ok) {
      console.error("Search error:", res.status);
      return { content: "Web search temporarily unavailable.", isError: true };
    }

    const json = await res.json();
    const hits = json?.web?.results ?? [];
    if (hits.length === 0) return { content: "No results found." };

    const summary = hits
      .slice(0, 5)
      .map((r: { title: string; url: string; description?: string }) =>
        `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.description ?? "N/A"}`
      )
      .join("\n\n---\n\n");

    return { content: `Results for "${query}":\n\n${summary}` };
  } catch (e) {
    console.error("Search exception:", e);
    return { content: "Web search unavailable.", isError: true };
  }
};
