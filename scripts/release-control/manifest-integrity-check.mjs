#!/usr/bin/env node
/**
 * Enforces append-only policy for docs/release/manifests/:
 * - Every JSON file under attestations/ matches `<manifest_id>.<sequence>.json` (sequence positive int).
 * - No duplicate (manifest_id, sequence).
 * - All attestation records pass validateAttestation.
 * - Release intents outside attestations/: one file per manifest_id (by parsing), kind=release_intent.
 * - Tracked files: `git rev-list --count HEAD -- <path>` must be **1** (single commit introduces each record).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateAttestation } from "./validate-release-manifest.mjs";
import { REPO_ROOT } from "./hashes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MANIFEST_ROOT = path.join(REPO_ROOT, "docs/release/manifests");
const ATTEST_DIR = path.join(MANIFEST_ROOT, "attestations");

/** manifest_id.<sequence>.json — sequence is a positive integer (allows leading zeros in filename) */
const FILENAME_RE = /^(.+)\.(\d+)\.json$/;

function commitCountForPath(fileRel) {
  try {
    return execFileSync("git", ["rev-list", "--count", "HEAD", "--", fileRel], {
      encoding: "utf8",
      cwd: REPO_ROOT,
    }).trim();
  } catch {
    return "0";
  }
}

function assertAppendOnlyFile(fileRel) {
  const tracked = (() => {
    try {
      execFileSync("git", ["ls-files", "--error-unmatch", fileRel], {
        stdio: "pipe",
        cwd: REPO_ROOT,
      });
      return true;
    } catch {
      return false;
    }
  })();
  if (!tracked) {
    return;
  }
  const n = commitCountForPath(fileRel);
  if (n !== "1") {
    throw new Error(
      `Append-only violation: each manifest/attestation must be introduced in exactly one commit (found ${n} for ${fileRel})`,
    );
  }
}

function walkJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkJsonFiles(p));
    else if (ent.name.endsWith(".json")) out.push(p);
  }
  return out;
}

export function runManifestIntegrityCheck() {
  const errors = [];

  const manifestIds = new Map();
  for (const fp of walkJsonFiles(MANIFEST_ROOT)) {
    const rel = path.relative(REPO_ROOT, fp).replace(/\\/g, "/");
    if (rel.startsWith("docs/release/manifests/attestations/")) continue;
    if (rel.includes("/schema")) continue;
    let j;
    try {
      j = JSON.parse(fs.readFileSync(fp, "utf8"));
    } catch (e) {
      errors.push(`${rel}: ${e}`);
      continue;
    }
    if (j.kind !== "release_intent") continue;
    if (!j.manifest_id) {
      errors.push(`${rel}: missing manifest_id`);
      continue;
    }
    if (manifestIds.has(j.manifest_id)) {
      errors.push(`duplicate manifest_id ${j.manifest_id}: ${manifestIds.get(j.manifest_id)} vs ${rel}`);
    } else {
      manifestIds.set(j.manifest_id, rel);
    }
    try {
      assertAppendOnlyFile(rel);
    } catch (e) {
      errors.push(e.message);
    }
  }

  const seqByManifest = new Map();
  if (fs.existsSync(ATTEST_DIR)) {
    for (const ent of fs.readdirSync(ATTEST_DIR, { withFileTypes: true })) {
      if (!ent.isFile() || !ent.name.endsWith(".json")) continue;
      const m = ent.name.match(FILENAME_RE);
      if (!m) {
        errors.push(`attestation file name invalid: ${ent.name}`);
        continue;
      }
      const manifestId = m[1];
      const seq = Number(m[2]);
      if (!Number.isInteger(seq) || seq < 1) {
        errors.push(`attestation sequence must be >= 1: ${ent.name}`);
        continue;
      }
      const rel = path.relative(REPO_ROOT, path.join(ATTEST_DIR, ent.name)).replace(/\\/g, "/");
      const key = `${manifestId}::${seq}`;
      if (seqByManifest.has(key)) {
        errors.push(`duplicate sequence: ${key}`);
      }
      seqByManifest.set(key, true);

      let a;
      try {
        a = JSON.parse(fs.readFileSync(path.join(ATTEST_DIR, ent.name), "utf8"));
      } catch (e) {
        errors.push(`${rel}: ${e}`);
        continue;
      }
      const v = validateAttestation(a);
      if (!v.ok) errors.push(`${rel}: ${v.errors.join("; ")}`);
      if (a.manifest_id !== manifestId) {
        errors.push(`${rel}: filename manifest_id != JSON manifest_id`);
      }
      if (a.sequence !== seq) {
        errors.push(`${rel}: filename sequence != JSON sequence`);
      }
      try {
        assertAppendOnlyFile(rel);
      } catch (e) {
        errors.push(e.message);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  const { ok, errors } = runManifestIntegrityCheck();
  if (!ok) {
    console.error(JSON.stringify({ ok: false, errors }, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true }, null, 0));
}

const __filename = path.resolve(fileURLToPath(import.meta.url));
if (path.resolve(process.argv[1]) === __filename) {
  main();
}
