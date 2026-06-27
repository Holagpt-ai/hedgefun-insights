import type { ToolDefinition, ToolHandler, ToolResult } from "./types.ts";

export const webSearchDefinition: ToolDefinition = {
  name: "web_search",
  description:
    "Searches the web for current information. Use this for: current PDT rules and margin requirements, recent regulatory changes, live market news, broker-specific rules (Robinhood, TD Ameritrade, etc.), earnings dates, recent IPO filings, or any factual question that may have changed after your training cutoff. Always cite your sources in the response and add 'verify with your broker' for any regulatory or broker-specific information.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to look up.",
      },
    },
    required: ["query"],
  },
};

// Sentinel value — web_search is handled natively by Anthropic.
// The agentic loop in index.ts detects this and skips manual tool_result injection.
export const webSearchHandler: ToolHandler = async (
  _userId: string,
  _supabase: unknown,
  _params: Record<string, unknown>
): Promise<ToolResult> => {
  return { content: "__USE_ANTHROPIC_NATIVE_SEARCH__" };
};
