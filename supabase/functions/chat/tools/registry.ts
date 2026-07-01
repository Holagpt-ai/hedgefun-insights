import type { RegisteredTool, ToolDefinition, ToolResult } from "./types.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getJournalStatsDefinition,
  getJournalStatsHandler,
  getRecentTradesDefinition,
  getRecentTradesHandler,
} from "./journal.ts";
import { webSearchDefinition, webSearchHandler } from "./web_search.ts";
import { getQuoteDefinition, getQuoteHandler } from "./quote.ts";

export const TOOL_REGISTRY: Record<string, RegisteredTool> = {
  get_journal_stats: {
    definition: getJournalStatsDefinition,
    handler: getJournalStatsHandler,
  },
  get_recent_trades: {
    definition: getRecentTradesDefinition,
    handler: getRecentTradesHandler,
  },
  web_search: {
    definition: webSearchDefinition,
    handler: webSearchHandler,
  },
  get_quote: {
    definition: getQuoteDefinition,
    handler: getQuoteHandler,
  },
};

export function getToolDefinitions(toolNames: string[]): ToolDefinition[] {
  return toolNames
    .filter((name) => name in TOOL_REGISTRY)
    .map((name) => TOOL_REGISTRY[name].definition);
}

export async function executeTool(
  name: string,
  userId: string,
  supabase: SupabaseClient,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const registered = TOOL_REGISTRY[name];
  if (!registered) {
    return {
      content: `Tool "${name}" is not registered.`,
      isError: true,
    };
  }
  return await registered.handler(userId, supabase, params);
}
