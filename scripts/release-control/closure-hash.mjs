import crypto from "node:crypto";
import { sha256HexGitObject } from "./hashes.mjs";
import { closurePosixPathsFromGit } from "./edge-closure.mjs";

/**
 * Aggregate hash: sha256 of sorted lines `path:relative_file_hash`.
 */
export function edgeImportClosureSha256Sync(gitRef, entryRel) {
  const files = closurePosixPathsFromGit(gitRef, entryRel);
  const lines = [];
  for (const f of files) {
    const h = sha256HexGitObject(gitRef, `supabase/functions/${f}`);
    if (!h) {
      throw new Error(`Missing git object ${gitRef}:supabase/functions/${f}`);
    }
    lines.push(`${f}:${h}`);
  }
  lines.sort();
  const joined = lines.join("\n") + "\n";
  return crypto.createHash("sha256").update(joined, "utf8").digest("hex");
}
