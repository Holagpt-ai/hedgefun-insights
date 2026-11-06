#!/usr/bin/env node
/**
 * CI entry: reads URC_MANIFEST_PATH from env; validates safe path; runs verify-release.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { REPO_ROOT } from "./hashes.mjs";

const raw = process.env.URC_MANIFEST_PATH ?? "";
if (!raw) {
  console.error("URC_MANIFEST_PATH is required");
  process.exit(2);
}

const normalized = path.posix.normalize(raw.replace(/\\/g, "/"));
if (
  normalized.includes("..") ||
  !normalized.startsWith("docs/release/manifests/") ||
  !normalized.endsWith(".json") ||
  normalized.includes("/attestations/") ||
  path.basename(normalized).startsWith("schema")
) {
  console.error(JSON.stringify({ ok: false, error: "invalid_manifest_path", path: raw }));
  process.exit(2);
}

const abs = path.join(REPO_ROOT, ...normalized.split("/"));
if (!abs.startsWith(path.join(REPO_ROOT, "docs/release/manifests"))) {
  console.error(JSON.stringify({ ok: false, error: "path_traversal_blocked" }));
  process.exit(2);
}
if (!fs.existsSync(abs)) {
  console.error(JSON.stringify({ ok: false, error: "manifest_not_found", resolved: normalized }));
  process.exit(2);
}

function runNode(args) {
  const r = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    encoding: "utf8",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

runNode(["--test", "scripts/release-control/release-control.test.mjs"]);
runNode(["scripts/release-control/manifest-integrity-check.mjs"]);
runNode(["scripts/release-control/verify-release.mjs", normalized]);
