import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
// @ts-expect-error untyped emit helper; mirrors @lovable.dev/mcp-js supabase esbuild
import { mcpWindowsSafeEmitPlugin } from "./scripts/mcp-supabase-emit.mjs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mcpPlugin(),
    // Official plugin uses an absolute import in its esbuild wrapper. On Windows
    // that path is treated as a bare specifier and the MCP function collapses.
    // Re-emit with a relative import after the official plugin; output matches
    // the POSIX generator byte-for-byte and keeps the AUTO-GENERATED banner.
    mcpWindowsSafeEmitPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
