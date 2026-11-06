#!/usr/bin/env node
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

function normalizeTextBuf(buf) {
  let s = buf.toString("utf8");
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

const [gitRef, prefix] = process.argv.slice(2);
if (!gitRef || !prefix) {
  console.error("Usage: compute-tree-hash.mjs <git_ref> <path_prefix>");
  process.exit(1);
}

const out = execFileSync("git", ["ls-tree", "-r", "--name-only", gitRef, prefix], {
  encoding: "utf8",
});
const files = out.trim().split("\n").filter(Boolean).sort();
const lines = [];
for (const f of files) {
  const raw = execFileSync("git", ["show", `${gitRef}:${f}`], {
    maxBuffer: 128 * 1024 * 1024,
  });
  const h = crypto
    .createHash("sha256")
    .update(normalizeTextBuf(raw), "utf8")
    .digest("hex");
  lines.push(`${f}:${h}`);
}
const agg = crypto
  .createHash("sha256")
  .update(lines.join("\n") + "\n", "utf8")
  .digest("hex");
console.log(JSON.stringify({ fileCount: files.length, pathPrefix: prefix, sha256: agg }));
