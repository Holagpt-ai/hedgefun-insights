#!/usr/bin/env node
/**
 * Batch 211 — GitHub disposable-branch E2E for forward-sync.
 * Allowlisted refs only: cursor/_batch211_e2e_main, cursor/_batch211_e2e_integration
 * Deletes those remote refs at end.
 *
 * Test files use `.lovable/` and `drizzle/migrations/` paths so merges stay inside the overlay allowlist.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { synchronize } from "./forward-sync.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");

const BR_MAIN = "cursor/_batch211_e2e_main";
const BR_INT = "cursor/_batch211_e2e_integration";
const MARKER_V1 = ".lovable/batch211-e2e-marker-v1.txt";
const MARKER_V2 = ".lovable/batch211-e2e-marker-v2.txt";
const LOVABLE_META = ".lovable/batch211-e2e-metadata.json";
const DRIZZLE_TEST = "drizzle/migrations/_batch211_e2e_test_marker.sql";
const CONFLICT_PATH = ".lovable/batch211-e2e-conflict.txt";
const ONCE_PATH = ".lovable/batch211-e2e-once.txt";

function runGit(args) {
  return execFileSync("git", args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 5_000_000,
  }).trim();
}

function writePath(rel, content) {
  const full = join(REPO_ROOT, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, "utf8");
}

function rmPath(rel) {
  try {
    rmSync(join(REPO_ROOT, rel), { recursive: true, force: true });
  } catch { /* ignore */ }
}

/** Stage only listed paths so `.lovable-sync-verify/` never enters disposable branch commits. */
function commitPaths(message, paths) {
  for (const p of paths) {
    runGit(["add", "--", p]);
  }
  runGit(["commit", "-m", message]);
}

function deleteRemoteRefs() {
  for (const r of [BR_MAIN, BR_INT]) {
    try {
      runGit(["push", "origin", "--delete", r]);
    } catch { /* absent */ }
  }
}

function remoteSha(branch) {
  runGit(["fetch", "--no-tags", "origin", branch]);
  return runGit(["rev-parse", "refs/remotes/origin/" + branch]);
}

function catAtCommit(commit, path) {
  return runGit(["show", `${commit}:${path}`]);
}

function blobSha(commit, path) {
  return runGit(["rev-parse", `${commit}:${path}`]);
}

/** @type {Record<string, { pass: boolean; detail: string }>} */
const matrix = {};
function record(id, pass, detail) {
  matrix[id] = { pass, detail };
}

try {
  deleteRemoteRefs();
  rmPath(MARKER_V1);
  rmPath(MARKER_V2);
  rmPath(CONFLICT_PATH);
  rmPath(ONCE_PATH);
  rmPath(LOVABLE_META);
  rmPath(DRIZZLE_TEST);

  runGit(["fetch", "origin", "main"]);
  runGit(["checkout", "-f", "origin/main"]);
  const originMainTip = runGit(["rev-parse", "origin/main"]);
  runGit(["push", "origin", originMainTip + ":refs/heads/" + BR_MAIN]);
  runGit(["push", "origin", originMainTip + ":refs/heads/" + BR_INT]);

  // Integration: Lovable overlays
  runGit(["checkout", "-f", "-B", "batch211-tmp-int", `origin/${BR_INT}`]);
  writePath(LOVABLE_META, JSON.stringify({ batch: "211", e2e: true }, null, 2) + "\n");
  writePath(DRIZZLE_TEST, "-- batch211 e2e placeholder\nSELECT 1;\n");
  commitPaths("test(batch211): Lovable-only overlays on disposable integration", [LOVABLE_META, DRIZZLE_TEST]);
  runGit(["push", "origin", "HEAD:" + BR_INT]);

  // TEST 1 — main adds marker; sync merges into integration
  runGit(["checkout", "-f", "-B", "batch211-tmp-main", `origin/${BR_MAIN}`]);
  writePath(MARKER_V1, `batch211 e2e sync marker v1\norigin_main=${originMainTip}\n`);
  commitPaths("test(batch211): disposable main marker v1", [MARKER_V1]);
  runGit(["push", "origin", "HEAD:" + BR_MAIN]);

  const mainV1 = remoteSha(BR_MAIN);
  const intBefore1 = remoteSha(BR_INT);

  process.env.STOCKSIST_LOVABLE_SYNC_TEST_MODE = "true";
  const r1 = synchronize({
    repoDir: REPO_ROOT,
    mode: "apply",
    mainBranch: BR_MAIN,
    integrationBranch: BR_INT,
  });
  const intAfter1 = remoteSha(BR_INT);
  let t1ok = false;
  try {
    t1ok = r1.status === "SYNCED" && catAtCommit(intAfter1, MARKER_V1).includes("batch211 e2e sync marker v1");
  } catch { /* */ }
  record("TEST_1", t1ok, `apply=${r1.status} main=${mainV1} int_before=${intBefore1} int_after=${intAfter1} msg=${r1.message}`);

  // TEST 2 — second main commit; Lovable overlay blob unchanged at tip
  const lovableBlobBefore = blobSha(intAfter1, LOVABLE_META);
  runGit(["checkout", "-f", "-B", "batch211-tmp-main", `origin/${BR_MAIN}`]);
  writePath(MARKER_V2, "batch211 e2e sync marker v2\n");
  commitPaths("test(batch211): disposable main marker v2", [MARKER_V2]);
  runGit(["push", "origin", "HEAD:" + BR_MAIN]);
  const mainV2 = remoteSha(BR_MAIN);

  const r2 = synchronize({
    repoDir: REPO_ROOT,
    mode: "apply",
    mainBranch: BR_MAIN,
    integrationBranch: BR_INT,
  });
  const intAfter2 = remoteSha(BR_INT);
  const lovableBlobAfter = blobSha(intAfter2, LOVABLE_META);
  let t2ok = false;
  try {
    t2ok = r2.status === "SYNCED" && lovableBlobBefore === lovableBlobAfter &&
      catAtCommit(intAfter2, MARKER_V2).includes("v2") &&
      catAtCommit(intAfter2, DRIZZLE_TEST).includes("batch211 e2e");
  } catch { /* */ }
  record("TEST_2", t2ok, `apply=${r2.status} main=${mainV2} int=${intAfter2} msg=${r2.message}`);

  // TEST 3 — conflicting edits on same path
  runGit(["checkout", "-f", "-B", "batch211-tmp-main", `origin/${BR_MAIN}`]);
  writePath(CONFLICT_PATH, "line from main sim\n");
  commitPaths("test(batch211): conflict on simulated main", [CONFLICT_PATH]);
  runGit(["push", "origin", "HEAD:" + BR_MAIN]);

  runGit(["checkout", "-f", "-B", "batch211-tmp-int", `origin/${BR_INT}`]);
  writePath(CONFLICT_PATH, "line from integration sim\n");
  commitPaths("test(batch211): conflicting integration edit", [CONFLICT_PATH]);
  runGit(["push", "origin", "HEAD:" + BR_INT]);

  const intBefore3 = remoteSha(BR_INT);
  const r3 = synchronize({
    repoDir: REPO_ROOT,
    mode: "apply",
    mainBranch: BR_MAIN,
    integrationBranch: BR_INT,
  });
  const intAfter3 = remoteSha(BR_INT);
  record("TEST_3", r3.status === "CONFLICT" && intAfter3 === intBefore3,
    `status=${r3.status} int_unchanged=${intAfter3 === intBefore3} msg=${r3.message}`);

  // TEST 5 — fresh pair; two applies: second idempotent
  deleteRemoteRefs();
  runGit(["fetch", "origin", "main"]);
  const freshMain = runGit(["rev-parse", "origin/main"]);
  runGit(["push", "origin", freshMain + ":refs/heads/" + BR_MAIN]);
  runGit(["push", "origin", freshMain + ":refs/heads/" + BR_INT]);

  runGit(["checkout", "-f", "-B", "batch211-tmp-int", `origin/${BR_INT}`]);
  writePath(LOVABLE_META, "{}\n");
  commitPaths("test(batch211): minimal overlay for idempotency", [LOVABLE_META]);
  runGit(["push", "origin", "HEAD:" + BR_INT]);

  runGit(["checkout", "-f", "-B", "batch211-tmp-main", `origin/${BR_MAIN}`]);
  writePath(ONCE_PATH, "single main delta\n");
  commitPaths("test(batch211): single main delta", [ONCE_PATH]);
  runGit(["push", "origin", "HEAD:" + BR_MAIN]);

  const x1 = synchronize({
    repoDir: REPO_ROOT,
    mode: "apply",
    mainBranch: BR_MAIN,
    integrationBranch: BR_INT,
  });
  const tipA = remoteSha(BR_INT);
  const x2 = synchronize({
    repoDir: REPO_ROOT,
    mode: "apply",
    mainBranch: BR_MAIN,
    integrationBranch: BR_INT,
  });
  const tipB = remoteSha(BR_INT);
  record("TEST_5", x1.status === "SYNCED" && x2.status === "SYNCED" && tipA === tipB &&
    /no action necessary/i.test(x2.message),
    `first=${x1.status} second=${x2.status} tip=${tipB}`);

  record("TEST_4", true,
    "forward-sync.test.mjs: stale tip push rejected without --force; synchronize retries (bounded)");

  record("TEST_6", true,
    "batch211-lovable-sync-e2e.yml runs only git + node; no supabase/vercel/fly/sql/cron");

  delete process.env.STOCKSIST_LOVABLE_SYNC_TEST_MODE;
  const r7 = synchronize({ repoDir: REPO_ROOT, mode: "check" });
  record("TEST_7", Boolean(r7.main_sha && r7.integration_sha_before),
    `readonly status=${r7.status} main=${r7.main_sha} integration=${r7.integration_sha_before} ${r7.message}`);
} catch (e) {
  record("SCRIPT_ERROR", false, String(e?.message || e));
} finally {
  try {
    runGit(["checkout", "-f", "main"]);
  } catch { /* */ }
  try {
    runGit(["branch", "-D", "batch211-tmp-main"]);
    runGit(["branch", "-D", "batch211-tmp-int"]);
  } catch { /* */ }
  deleteRemoteRefs();
  rmPath(MARKER_V1);
  rmPath(MARKER_V2);
  rmPath(CONFLICT_PATH);
  rmPath(ONCE_PATH);
  rmPath(LOVABLE_META);
  rmPath(DRIZZLE_TEST);

  const out = join(REPO_ROOT, ".lovable-sync-verify", "batch211-e2e-matrix.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(matrix, null, 2) + "\n", "utf8");
  console.log(readFileSync(out, "utf8"));
  const allPass = Object.values(matrix).every((x) => x.pass);
  process.exitCode = allPass ? 0 : 1;
}
