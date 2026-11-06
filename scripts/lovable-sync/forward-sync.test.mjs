import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { INTEGRATION_BRANCH, isApprovedLovableOverlay, synchronize } from "./forward-sync.mjs";

const run = (dir, ...args) => execFileSync("git", args, {
  cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
}).trim();
function write(repo, path, content) {
  const target = join(repo, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
function commit(repo, message) {
  run(repo, "add", "-A");
  run(repo, "commit", "-m", message);
}
function fixture(options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "stocksist-sync-test-"));
  const origin = join(dir, "origin.git");
  const clone = join(dir, "clone");
  run(dir, "init", "--bare", "--initial-branch=main", origin);
  run(dir, "clone", origin, clone);
  run(clone, "config", "user.name", "Batch211 Test");
  run(clone, "config", "user.email", "batch211@example.invalid");
  write(clone, "src/app.ts", "export const label = 'initial';\n");
  commit(clone, "base");
  run(clone, "push", "-u", "origin", "main");
  run(clone, "checkout", "-b", INTEGRATION_BRANCH);
  write(clone, ".lovable/plan.md", "Lovable local planning\n");
  write(clone, "drizzle/migrations/meta/_journal.json", "{}\n");
  write(clone, "bun.lock", "lovable-only-lock\n");
  if (options.unapprovedOverlay) write(clone, "src/rogue.ts", "export const rogue = 1;\n");
  if (options.conflict) write(clone, "src/app.ts", "export const label = 'lovable';\n");
  commit(clone, "Lovable-specific snapshot");
  run(clone, "push", "-u", "origin", INTEGRATION_BRANCH);
  run(clone, "checkout", "main");
  write(clone, "src/app.ts", options.conflict ?
    "export const label = 'github';\n" : "export const label = 'approved';\n");
  commit(clone, "approved main update");
  run(clone, "push", "origin", "main");
  return { dir, origin, clone, dispose() { rmSync(dir, { recursive: true, force: true }); } };
}
function remoteHead(f) {
  run(f.clone, "fetch", "--no-tags", "origin", INTEGRATION_BRANCH);
  return run(f.clone, "rev-parse", "refs/remotes/origin/" + INTEGRATION_BRANCH);
}

test("overlay allowlist only permits known Lovable-owned paths", () => {
  assert.equal(isApprovedLovableOverlay(".lovable/plan.md"), true);
  assert.equal(isApprovedLovableOverlay("drizzle/migrations/meta/_journal.json"), true);
  assert.equal(isApprovedLovableOverlay("src/integrations/supabase/types.ts"), true);
  assert.equal(isApprovedLovableOverlay("supabase/functions/mcp/index.ts"), true);
  assert.equal(isApprovedLovableOverlay("src/pages/Trade.tsx"), false);
  assert.equal(isApprovedLovableOverlay("supabase/migrations/20261106.sql"), false);
  assert.equal(isApprovedLovableOverlay("supabase/functions/chat/index.ts"), false);
});

test("read-only check reports BEHIND and never pushes", () => {
  const f = fixture();
  try {
    const prior = remoteHead(f);
    const result = synchronize({ repoDir: f.clone, mode: "check" });
    assert.equal(result.status, "BEHIND");
    assert.equal(result.integration_sha_after, prior);
    assert.equal(remoteHead(f), prior);
    assert.equal(existsSync(join(f.clone, ".lovable-sync-verify/status.json")), true);
  } finally { f.dispose(); }
});

test("approved apply performs ordinary fast-forward preserving Lovable-only history", () => {
  const f = fixture();
  try {
    const result = synchronize({ repoDir: f.clone, mode: "apply" });
    assert.equal(result.status, "SYNCED");
    assert.notEqual(result.integration_sha_after, result.integration_sha_before);
    assert.equal(remoteHead(f), result.integration_sha_after);
    run(f.clone, "fetch", "origin", "main");
    run(f.clone, "merge-base", "--is-ancestor",
      "refs/remotes/origin/main", result.integration_sha_after);
    const overlay = run(f.clone, "show", result.integration_sha_after + ":.lovable/plan.md");
    assert.match(overlay, /Lovable local planning/);
    const src = run(f.clone, "show", result.integration_sha_after + ":src/app.ts");
    assert.match(src, /approved/);
  } finally { f.dispose(); }
});

test("repeated apply is idempotent and creates no extra merge", () => {
  const f = fixture();
  try {
    assert.equal(synchronize({ repoDir: f.clone, mode: "apply" }).status, "SYNCED");
    const prior = remoteHead(f);
    const next = synchronize({ repoDir: f.clone, mode: "apply" });
    assert.equal(next.status, "SYNCED");
    assert.equal(remoteHead(f), prior);
    assert.match(next.message, /no action necessary/);
  } finally { f.dispose(); }
});

test("a true content conflict blocks without writing remote integration", () => {
  const f = fixture({ conflict: true });
  try {
    const prior = remoteHead(f);
    const result = synchronize({ repoDir: f.clone, mode: "apply" });
    assert.equal(result.status, "CONFLICT");
    assert.equal(remoteHead(f), prior);
  } finally { f.dispose(); }
});

test("unapproved Lovable overlay drift fails closed before a push", () => {
  const f = fixture({ unapprovedOverlay: true });
  try {
    const prior = remoteHead(f);
    const result = synchronize({ repoDir: f.clone, mode: "apply" });
    assert.equal(result.status, "CONFLICT");
    assert.deepEqual(result.unexpected_paths, ["src/rogue.ts"]);
    assert.equal(remoteHead(f), prior);
  } finally { f.dispose(); }
});

test("Git push rejects a stale candidate without force", () => {
  const f = fixture();
  try {
    run(f.clone, "fetch", "origin", INTEGRATION_BRANCH);
    const previous = remoteHead(f);
    // Another Lovable writer advances the tracked remote before the stale push.
    run(f.clone, "checkout", INTEGRATION_BRANCH);
    write(f.clone, ".lovable/north-star.md", "another writer\n");
    commit(f.clone, "concurrent lovable edit");
    run(f.clone, "push", "origin", INTEGRATION_BRANCH);
    const next = remoteHead(f);
    assert.notEqual(next, previous);
    // A stale commit based on the earlier tip cannot overwrite the new tip.
    run(f.clone, "checkout", "--detach", previous);
    write(f.clone, ".lovable/plan.md", "old-branch attempt\n");
    commit(f.clone, "stale attempt");
    assert.throws(() => run(f.clone, "push", "origin",
      "HEAD:refs/heads/" + INTEGRATION_BRANCH));
    assert.equal(remoteHead(f), next);
  } finally { f.dispose(); }
});
