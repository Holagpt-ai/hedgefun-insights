#!/usr/bin/env node
/**
 * Batch 211 — safe main -> Lovable integration forward-sync.
 * Git-only. Never deploys anything. Never writes to main. No force push/rebase/reset.
 * Apply is separately gated by the workflow and an explicit environment opt-in.
 *
 * Test / disposable mode (STOCKSIST_LOVABLE_SYNC_TEST_MODE=true):
 *   Set STOCKSIST_LOVABLE_SYNC_TEST_MAIN_BRANCH and STOCKSIST_LOVABLE_SYNC_TEST_INTEGRATION_BRANCH
 *   to allowlisted refs under cursor/_batch211_e2e_* only. Apply is allowed without
 *   STOCKSIST_LOVABLE_SYNC_ACTIVATED so CI can prove remote sync without touching production branches.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MAIN_BRANCH = "main";
export const INTEGRATION_BRANCH = "cursor/lovable-sync-from-main-20261024";

/** Disposable E2E branches must use this prefix (single segment after cursor/). */
export const TEST_BRANCH_PREFIX = "cursor/_batch211_e2e_";

/** GitHub disposable rehearsal refs (same names as batch211-github-e2e.mjs). */
export const E2E_MAIN_BRANCH = "cursor/_batch211_e2e_main";
export const E2E_INTEGRATION_BRANCH = "cursor/_batch211_e2e_integration";

const MAX_ATTEMPTS = 3;

const EXPLICIT_OVERLAY_PATHS = new Set([
  "bun.lock",
  "src/integrations/supabase/types.ts",
  "supabase/functions/mcp/index.ts",
  "supabase/functions/sync-screener-data/handler_test.ts",
]);

export function isApprovedLovableOverlay(path) {
  return path.startsWith(".lovable/") ||
    path.startsWith("drizzle/migrations/") ||
    EXPLICIT_OVERLAY_PATHS.has(path);
}

export function isAllowlistedDisposableBranch(name) {
  return typeof name === "string" &&
    name.startsWith(TEST_BRANCH_PREFIX) &&
    name.length > TEST_BRANCH_PREFIX.length &&
    !name.includes("..") &&
    !name.includes("\0");
}

/**
 * Apply authorization (enforced inside synchronize).
 * - Production: only refs/main + refs/integration and STOCKSIST_LOVABLE_SYNC_ACTIVATED === "true".
 * - Disposable rehearsal: both refs allowlisted under TEST_BRANCH_PREFIX and STOCKSIST_LOVABLE_SYNC_TEST_MODE === "true".
 */
export function authorizeApply(mainBranch, integrationBranch) {
  const prodPair = mainBranch === MAIN_BRANCH && integrationBranch === INTEGRATION_BRANCH;
  const disposablePair =
    isAllowlistedDisposableBranch(mainBranch) &&
    isAllowlistedDisposableBranch(integrationBranch);
  if (prodPair) {
    if (process.env.STOCKSIST_LOVABLE_SYNC_ACTIVATED === "true") {
      return { ok: true, kind: "production" };
    }
    return {
      ok: false,
      message: "Apply blocked: production integration sync requires STOCKSIST_LOVABLE_SYNC_ACTIVATED=true",
    };
  }
  if (disposablePair) {
    if (process.env.STOCKSIST_LOVABLE_SYNC_TEST_MODE === "true") {
      return { ok: true, kind: "test" };
    }
    return {
      ok: false,
      message: "Apply blocked: disposable ref writes require STOCKSIST_LOVABLE_SYNC_TEST_MODE=true",
    };
  }
  return {
    ok: false,
    message: "Apply blocked: use main + production integration branch, or a fully allowlisted disposable pair",
  };
}

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 5_000_000 }).trim();
}
function quietGit(cwd, args) {
  try { git(cwd, args); return true; } catch { return false; }
}
function shortError(error) {
  const message = String(error?.stderr || error?.message || error);
  return message.replace(/https?:\/\/[^\s]+/g, "<remote>").slice(0, 400);
}
function getChangedPaths(repoDir, baseline, candidate) {
  const raw = execFileSync("git", ["diff", "--name-only", "-z", baseline, candidate, "--"], {
    cwd: repoDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 5_000_000,
  });
  return raw.split("\0").filter(Boolean);
}
function fetchRefs(root, mainBranch, integrationBranch) {
  git(root, [
    "fetch", "--no-tags", "origin",
    "+refs/heads/" + mainBranch + ":refs/remotes/origin/" + mainBranch,
    "+refs/heads/" + integrationBranch + ":refs/remotes/origin/" + integrationBranch,
  ]);
  return {
    main: git(root, ["rev-parse", "refs/remotes/origin/" + mainBranch]),
    integration: git(root, ["rev-parse", "refs/remotes/origin/" + integrationBranch]),
  };
}
function overlayCheck(root, mainSha, integrationSha) {
  const diff = getChangedPaths(root, mainSha, integrationSha);
  const unexpected = diff.filter((path) => !isApprovedLovableOverlay(path));
  return { overlayFiles: diff, unexpected };
}
function writeReport(root, report) {
  const output = join(root, ".lovable-sync-verify");
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "status.json"), JSON.stringify(report, null, 2) + "\n");
  const lines = [
    "# Stocksist Lovable source sync",
    "",
    "| Field | Value |", "| --- | --- |",
    ...["status", "mode", "main_sha", "integration_sha_before", "integration_sha_after", "attempts", "message"].map((key) =>
      "| " + key + " | " + String(report[key] ?? "—").replace(/\|/g, "/").replace(/\n/g, " ") + " |"),
    "",
    "- Lovable editor parity: **UNKNOWN** (Git branch status is not editor state).",
    "- Live Edge, Fly and Vercel runtime parity: **UNKNOWN** (no deployments performed).",
    "- Files changed outside approved Lovable overlay: " + (report.unexpected_paths?.length ?? 0),
  ];
  writeFileSync(join(output, "status.md"), lines.join("\n") + "\n");
}

/**
 * @param {object} [opts]
 * @param {string} [opts.repoDir]
 * @param {"check"|"apply"} [opts.mode]
 * @param {number} [opts.attempts]
 * @param {string} [opts.mainBranch]
 * @param {string} [opts.integrationBranch]
 */
export function synchronize({
  repoDir = process.cwd(),
  mode = "check",
  attempts = MAX_ATTEMPTS,
  mainBranch = MAIN_BRANCH,
  integrationBranch = INTEGRATION_BRANCH,
} = {}) {
  if (!["check", "apply"].includes(mode)) throw new Error("Unsupported mode");
  if (!isAllowlistedDisposableBranch(mainBranch) && mainBranch !== MAIN_BRANCH) {
    throw new Error("mainBranch must be main or an allowlisted disposable test ref");
  }
  if (!isAllowlistedDisposableBranch(integrationBranch) && integrationBranch !== INTEGRATION_BRANCH) {
    throw new Error("integrationBranch must be the production integration ref or an allowlisted disposable test ref");
  }
  if (mode === "apply") {
    const auth = authorizeApply(mainBranch, integrationBranch);
    if (!auth.ok) {
      const root = resolve(repoDir);
      const report = {
        status: "UNKNOWN",
        mode,
        attempts: 0,
        main_sha: null,
        integration_sha_before: null,
        integration_sha_after: null,
        unexpected_paths: [],
        message: auth.message,
      };
      writeReport(root, report);
      return report;
    }
  }
  const root = resolve(repoDir);
  let report = { status: "UNKNOWN", mode, attempts: 0, main_sha: null,
    integration_sha_before: null, integration_sha_after: null, unexpected_paths: [],
    message: "Not evaluated" };
  try {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      report.attempts = attempt;
      const { main, integration } = fetchRefs(root, mainBranch, integrationBranch);
      report.main_sha = main;
      report.integration_sha_before = integration;
      report.integration_sha_after = integration;
      if (!quietGit(root, ["merge-base", main, integration])) {
        report.status = "CONFLICT";
        report.message = "Unrelated histories; manual review required";
        break;
      }
      const current = overlayCheck(root, main, integration);
      if (quietGit(root, ["merge-base", "--is-ancestor", main, integration])) {
        report.unexpected_paths = current.unexpected;
        report.status = current.unexpected.length ? "CONFLICT" : "SYNCED";
        report.message = current.unexpected.length
          ? "Integration differs from main outside the explicitly approved Lovable overlay"
          : "Integration contains current main; no action necessary";
        break;
      }
      // Use a disposable detached worktree; never reset/rebase/change the checked-out repo.
      const temp = mkdtempSync(join(tmpdir(), "stocksist-sync-"));
      const worktree = join(temp, "candidate");
      let added = false;
      try {
        git(root, ["worktree", "add", "--detach", worktree, integration]);
        added = true;
        try {
          git(worktree, ["-c", "user.name=stocksist-release-bot", "-c",
            "user.email=stocksist-release-bot@users.noreply.github.com",
            "merge", "--no-ff", "--no-edit", "-m",
            "chore(sync): forward approved main into Lovable integration", main]);
        } catch (error) {
          report.status = "CONFLICT";
          report.message = "Git merge conflict; requires human resolution: " + shortError(error);
          break;
        }
        const candidate = git(worktree, ["rev-parse", "HEAD"]);
        const diff = overlayCheck(worktree, main, candidate);
        report.unexpected_paths = diff.unexpected;
        if (diff.unexpected.length) {
          report.status = "CONFLICT";
          report.message = "Merge would change non-overlay files relative to main: " +
            diff.unexpected.slice(0, 8).join(", ");
          break;
        }
        if (!quietGit(worktree, ["merge-base", "--is-ancestor", main, "HEAD"])) {
          report.status = "CONFLICT";
          report.message = "Merged candidate does not contain approved main";
          break;
        }
        report.status = "BEHIND";
        report.message = "Clean forward merge available; integration branch unchanged";
        if (mode === "check") break;
        // Verify both remote heads again immediately before push to detect a Lovable bot race.
        const latest = fetchRefs(root, mainBranch, integrationBranch);
        if (latest.main !== main || latest.integration !== integration) {
          report.message = "Remote advanced during merge; revalidating before retry";
          continue;
        }
        try {
          // Normal fast-forward push only. Never force, overwrite, or update main.
          git(worktree, ["push", "origin", "HEAD:refs/heads/" + integrationBranch]);
          report.status = "SYNCED";
          report.integration_sha_after = candidate;
          report.message = "Forward merge pushed (normal fast-forward)";
          break;
        } catch {
          report.message = "Push rejected (possible concurrent update or branch rule); retrying safely";
          if (attempt === attempts) {
            report.status = "UNKNOWN";
            report.message = "All attempts exhausted; no forced writes; inspect branch policy";
          }
        }
      } finally {
        if (added) {
          // Force removes only this disposable LOCAL worktree, never a remote ref.
          try { git(root, ["worktree", "remove", "--force", worktree]); } catch { /* disposable runner */ }
        }
        rmSync(temp, { recursive: true, force: true });
      }
    }
  } catch (error) {
    report.status = "UNKNOWN";
    report.message = "Read/fetch/write preflight unavailable: " + shortError(error);
  }
  writeReport(root, report);
  return report;
}

function parseBranchArgs(argv) {
  let mainBranch = MAIN_BRANCH;
  let integrationBranch = INTEGRATION_BRANCH;
  for (const arg of argv) {
    if (arg.startsWith("--main-branch=")) mainBranch = arg.slice("--main-branch=".length);
    if (arg.startsWith("--integration-branch=")) integrationBranch = arg.slice("--integration-branch=".length);
  }
  return { mainBranch, integrationBranch };
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  const rawMode = process.argv.find((arg) => arg.startsWith("--mode="));
  const mode = rawMode?.slice("--mode=".length) || "check";
  const { mainBranch, integrationBranch } = parseBranchArgs(process.argv);
  const testMode =
    process.env.STOCKSIST_LOVABLE_SYNC_TEST_MODE === "true" &&
    isAllowlistedDisposableBranch(mainBranch) &&
    isAllowlistedDisposableBranch(integrationBranch);

  if (!process.exitCode) {
    const report = synchronize({ mode, mainBranch, integrationBranch });
    console.log(JSON.stringify(report, null, 2));
    if (report.status === "UNKNOWN") {
      process.exitCode = 1;
    } else if (mode === "apply" && !testMode && report.status !== "SYNCED") {
      process.exitCode = 1;
    } else if (mode === "apply" && testMode && report.status !== "SYNCED" && report.status !== "CONFLICT") {
      process.exitCode = 1;
    } else if (mode === "check" && report.status === "CONFLICT") {
      process.exitCode = 1;
    }
  }
}
