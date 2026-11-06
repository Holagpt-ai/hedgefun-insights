#!/usr/bin/env node
/**
 * Batch 211 — safe main -> Lovable integration forward-sync.
 * Git-only. Never deploys anything. Never writes to main. No force push/rebase/reset.
 * Apply is separately gated by the workflow and an explicit environment opt-in.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MAIN_BRANCH = "main";
export const INTEGRATION_BRANCH = "cursor/lovable-sync-from-main-20261024";
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
function fetchRefs(root) {
  git(root, [
    "fetch", "--no-tags", "origin",
    "+refs/heads/main:refs/remotes/origin/main",
    "+refs/heads/cursor/lovable-sync-from-main-20261024:refs/remotes/origin/cursor/lovable-sync-from-main-20261024",
  ]);
  return {
    main: git(root, ["rev-parse", "refs/remotes/origin/main"]),
    integration: git(root, ["rev-parse", "refs/remotes/origin/cursor/lovable-sync-from-main-20261024"]),
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

export function synchronize({ repoDir = process.cwd(), mode = "check", attempts = MAX_ATTEMPTS } = {}) {
  if (!["check", "apply"].includes(mode)) throw new Error("Unsupported mode");
  const root = resolve(repoDir);
  let report = { status: "UNKNOWN", mode, attempts: 0, main_sha: null,
    integration_sha_before: null, integration_sha_after: null, unexpected_paths: [],
    message: "Not evaluated" };
  try {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      report.attempts = attempt;
      const { main, integration } = fetchRefs(root);
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
        const latest = fetchRefs(root);
        if (latest.main !== main || latest.integration !== integration) {
          report.message = "Remote advanced during merge; revalidating before retry";
          continue;
        }
        try {
          // Normal fast-forward push only. Never force, overwrite, or update main.
          git(worktree, ["push", "origin", "HEAD:refs/heads/" + INTEGRATION_BRANCH]);
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

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  const raw = process.argv.find((arg) => arg.startsWith("--mode="));
  const mode = raw?.slice("--mode=".length) || "check";
  if (mode === "apply" && process.env.STOCKSIST_LOVABLE_SYNC_ACTIVATED !== "true") {
    console.error("Sync apply BLOCKED: activation gate is not enabled");
    process.exitCode = 1;
  } else {
    const report = synchronize({ mode });
    console.log(JSON.stringify(report, null, 2));
    if (["CONFLICT", "UNKNOWN"].includes(report.status) || (mode === "apply" && report.status !== "SYNCED")) {
      process.exitCode = 1;
    }
  }
}
