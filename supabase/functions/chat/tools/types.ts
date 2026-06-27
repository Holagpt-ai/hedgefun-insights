import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export type ToolHandler = (
  userId: string,
  supabaseClient: SupabaseClient,
  params: Record<string, unknown>
) => Promise<ToolResult>;

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}
