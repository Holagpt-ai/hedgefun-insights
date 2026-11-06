#!/usr/bin/env node
/**
 * Batch 211 — GitHub disposable-branch E2E for forward-sync.
 * Allowlisted refs only:
 *   Pair A: cursor/_batch211_e2e_main + cursor/_batch211_e2e_integration (TEST 1–4)
 *   Pair B: cursor/_batch211_e2e_main_b + cursor/_batch211_e2e_integration_b (TEST 5)
 * Abort if any of those refs already exist on origin (another run may own them).
 * Deletes only refs created by this run at end (tracked in refsCreatedThisRun).
 *
 * Test files use `.lovable/` and `drizzle/migrations/` paths so merges stay inside the overlay allowlist.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  E2E_INTEGRATION_BRANCH,
  E2E_MAIN_BRANCH,
  synchronize,
} from "./forward-sync.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");

/** Pair A: TEST 1–4; Pair B: TEST 5 (idempotency) — never delete refs we did not create. */
const BR_MAIN = E2E_MAIN_BRANCH;
const BR_INT = E2E_INTEGRATION_BRANCH;
const BR_MAIN_B = "cursor/_batch211_e2e_main_b";
const BR_INT_B = "cursor/_batch211_e2e_integration_b";
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

/** Refs this run is allowed to delete (subset of disposable pair names). */
const refsCreatedThisRun = new Set();

function isRemoteBranchAbsent(branch) {
  try {
    const out = execFileSync("git", ["ls-remote", "--heads", "origin", branch], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 5_000_000,
    }).trim();
    return out.length === 0;
  } catch {
    return false;
  }
}

function assertDisposableRefsAbsentOrAbort() {
  const blocked = [];
  for (const r of [BR_MAIN, BR_INT, BR_MAIN_B, BR_INT_B]) {
    if (!isRemoteBranchAbsent(r)) blocked.push(r);
  }
  if (blocked.length) {
    throw new Error(
      "E2E aborted: disposable ref(s) already exist on origin — " +
        blocked.join(", ") +
        "; remove manually or wait for the owning run to finish. Will not delete unknown refs.",
    );
  }
}

function deleteRemoteRefsOwned() {
  for (const r of refsCreatedThisRun) {
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

function recordTest4UnitEvidence() {
  const wfPath = join(REPO_ROOT, ".github/workflows/lovable-source-forward-sync.yml");
  let lines = [];
  try {
    lines = readFileSync(wfPath, "utf8").split("\n");
  } catch {
    record("TEST_4", false, "evidence: unit/static — could not read lovable-source-forward-sync.yml");
    return;
  }
  const hits = lines
    .map((l, i) => ({ line: i + 1, text: l.trim() }))
    .filter(({ text }) => text.includes("forward-sync.test.mjs"));
  const ok = hits.length > 0;
  record(
    "TEST_4",
    ok,
    ok
      ? "evidence: unit/static — CI read-only job runs node --test scripts/lovable-sync/forward-sync.test.mjs " +
        `(lovable-source-forward-sync.yml lines ${hits.map((h) => h.line).join(",")}); ` +
        "stale non-ff push rejection is covered there, not re-run in this E2E script"
      : "evidence: unit/static — read-only workflow missing forward-sync.test.mjs step",
  );
}

function recordTest6WorkflowEvidence() {
  const wfPath = join(REPO_ROOT, ".github/workflows/batch211-lovable-sync-e2e.yml");
  let text = "";
  try {
    text = readFileSync(wfPath, "utf8");
  } catch {
    record("TEST_6", false, "evidence: static — could not read batch211-lovable-sync-e2e.yml");
    return;
  }
  const forbidden = ["supabase", "vercel", "fly.io", "cron", "sql"];
  const lower = text.toLowerCase();
  const found = forbidden.filter((k) => lower.includes(k));
  const ok = found.length === 0;
  record(
    "TEST_6",
    ok,
    ok
      ? "evidence: static — batch211-lovable-sync-e2e.yml has no supabase/vercel/fly/cron/sql substrings; " +
        "this matrix run only uses git + node (see job steps)"
      : `evidence: static — forbidden tokens in workflow: ${found.join(", ")}`,
  );
}

try {
  assertDisposableRefsAbsentOrAbort();
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
  refsCreatedThisRun.add(BR_MAIN);
  refsCreatedThisRun.add(BR_INT);

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

  recordTest4UnitEvidence();

  // TEST 5 — separate disposable pair B; two applies: second idempotent (does not delete pair A mid-run)
  runGit(["fetch", "origin", "main"]);
  const freshMain = runGit(["rev-parse", "origin/main"]);
  runGit(["push", "origin", freshMain + ":refs/heads/" + BR_MAIN_B]);
  runGit(["push", "origin", freshMain + ":refs/heads/" + BR_INT_B]);
  refsCreatedThisRun.add(BR_MAIN_B);
  refsCreatedThisRun.add(BR_INT_B);

  runGit(["checkout", "-f", "-B", "batch211-tmp-int-b", `origin/${BR_INT_B}`]);
  writePath(LOVABLE_META, "{}\n");
  commitPaths("test(batch211): minimal overlay for idempotency", [LOVABLE_META]);
  runGit(["push", "origin", "HEAD:" + BR_INT_B]);

  runGit(["checkout", "-f", "-B", "batch211-tmp-main-b", `origin/${BR_MAIN_B}`]);
  writePath(ONCE_PATH, "single main delta\n");
  commitPaths("test(batch211): single main delta", [ONCE_PATH]);
  runGit(["push", "origin", "HEAD:" + BR_MAIN_B]);

  const x1 = synchronize({
    repoDir: REPO_ROOT,
    mode: "apply",
    mainBranch: BR_MAIN_B,
    integrationBranch: BR_INT_B,
  });
  const tipA = remoteSha(BR_INT_B);
  const x2 = synchronize({
    repoDir: REPO_ROOT,
    mode: "apply",
    mainBranch: BR_MAIN_B,
    integrationBranch: BR_INT_B,
  });
  const tipB = remoteSha(BR_INT_B);
  record("TEST_5", x1.status === "SYNCED" && x2.status === "SYNCED" && tipA === tipB &&
    /no action necessary/i.test(x2.message),
    `first=${x1.status} second=${x2.status} tip=${tipB} pair=${BR_MAIN_B}+${BR_INT_B}`);

  recordTest6WorkflowEvidence();

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
    runGit(["branch", "-D", "batch211-tmp-main-b"]);
    runGit(["branch", "-D", "batch211-tmp-int-b"]);
  } catch { /* */ }
  deleteRemoteRefsOwned();
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
