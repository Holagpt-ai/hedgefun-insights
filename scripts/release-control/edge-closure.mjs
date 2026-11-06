import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

/**
 * Deno-style relative imports from supabase/functions entry.
 * @param {string} entryRel e.g. "sync-screener-data/index.ts"
 */
export function collectEdgeTsClosure(entryRel) {
  const root = path.join(repoRoot, "supabase", "functions");
  const seen = new Set();
  const queue = [entryRel];
  const importRe = /from\s+["'](\.\.?\/[^"']+)["']/g;
  while (queue.length) {
    const rel = queue.pop();
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    const fp = path.join(root, rel);
    if (!fs.existsSync(fp)) continue;
    const txt = fs.readFileSync(fp, "utf8");
    for (const m of txt.matchAll(importRe)) {
      let imp = m[1];
      if (!imp.endsWith(".ts")) imp += ".ts";
      const dir = path.dirname(rel);
      const resolved = path.normalize(path.join(dir, imp)).replace(/\\/g, "/");
      queue.push(resolved);
    }
  }
  return [...seen].filter((f) => f.endsWith(".ts")).sort();
}

/**
 * Sorted list of posix paths for git show (always /).
 */
export function closurePosixPaths(entryRel) {
  return collectEdgeTsClosure(entryRel).map((p) => p.replace(/\\/g, "/"));
}
