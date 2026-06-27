import type { ToolHandler, ToolResult } from "./types.ts";

// Anthropic native server tool — type field is set directly, no input_schema needed.
// The definition passed to the API uses Anthropic's server tool format.
export const webSearchDefinition = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
};

// Sentinel handler — web_search is executed natively by Anthropic, never by our code.
export const webSearchHandler: ToolHandler = async (
  _userId: string,
  _supabase: unknown,
  _params: Record<string, unknown>
): Promise<ToolResult> => {
  return { content: "__USE_ANTHROPIC_NATIVE_SEARCH__" };
};
