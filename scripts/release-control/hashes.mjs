import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

/**
 * Normalize text for cross-platform deterministic hashing in CI.
 * LF endings only; strips UTF-8 BOM if present.
 */
export function normalizeTextBuf(buf) {
  let s = buf.toString("utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function sha256HexOfBuffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function sha256HexOfNormalizedText(buf) {
  const n = normalizeTextBuf(buf);
  return crypto.createHash("sha256").update(n, "utf8").digest("hex");
}

/**
 * Read a path at a given git tree-ish (commit, tag). Returns Buffer or null.
 */
export function gitShowBuffer(gitRef, posixPath) {
  try {
    return execFileSync("git", ["show", `${gitRef}:${posixPath}`], {
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

export function sha256HexGitObject(gitRef, posixPath, mode = "normalized_text") {
  const raw = gitShowBuffer(gitRef, posixPath);
  if (!raw) return null;
  return mode === "normalized_text"
    ? sha256HexOfNormalizedText(raw)
    : sha256HexOfBuffer(raw);
}
