/**
 * Edge Function TypeScript import closure resolved entirely from git objects
 * at `gitRef` — not from the working tree (pinned-SHA verification).
 */
import path from "node:path";
import { gitShowBuffer } from "./hashes.mjs";

const IMPORT_RE = /\bfrom\s+["'](\.\.?\/[^"']+)["']/g;

function posix(p) {
  return p.replace(/\\/g, "/");
}

/**
 * @param {string} gitRef commit / tag
 * @param {string} entryRel e.g. "sync-screener-data/index.ts" (under supabase/functions)
 * @returns {string[]} sorted relative paths
 */
export function collectEdgeTsClosureFromGit(gitRef, entryRel) {
  const entry = posix(entryRel).replace(/^\/+/, "");
  if (!entry.endsWith(".ts")) {
    throw new Error(`Entry must be a .ts file: ${entryRel}`);
  }
  /** @type {Set<string>} */
  const seen = new Set();
  const queue = [entry];
  while (queue.length) {
    const rel = queue.pop();
    if (!rel || seen.has(rel)) continue;
    seen.add(rel);
    const posixPath = `supabase/functions/${rel}`;
    const buf = gitShowBuffer(gitRef, posixPath);
    if (!buf) {
      throw new Error(
        `Unresolved required import: missing blob ${gitRef}:${posixPath}`,
      );
    }
    const txt = buf.toString("utf8");
    const dir = path.posix.dirname(rel);
    for (const m of txt.matchAll(IMPORT_RE)) {
      let imp = m[1];
      if (!imp.endsWith(".ts")) imp += ".ts";
      let resolved = path.posix.normalize(path.posix.join(dir, imp));
      if (resolved.includes("..") || resolved.startsWith("/")) {
        throw new Error(`Resolved import escapes functions root: ${resolved}`);
      }
      queue.push(resolved);
    }
  }
  return [...seen].filter((f) => f.endsWith(".ts")).sort();
}

export function closurePosixPathsFromGit(gitRef, entryRel) {
  return collectEdgeTsClosureFromGit(gitRef, entryRel);
}
