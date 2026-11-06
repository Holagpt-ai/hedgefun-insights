# Batch 211 — Automated Lovable Source Forward Sync V1

**Scope:** Git source synchronization ONLY. No Supabase/Lovable Edge deployment, migration, Fly, Vercel, cron, secrets, billing, or runtime changes. **Status:** implementation PR / AUTO WRITE DISABLED until a separate owner-authorized activation.

## Problem and boundary

GitHub `main` is Stocksist's canonical application source. Lovable is connected to
`cursor/lovable-sync-from-main-20261024` instead of `main`, because its
Lovable-native metadata, Drizzle journal, generated Supabase types and related
overlays must be preserved. Lovable's Git connector can pull its tracked branch,
but it **does not merge commits from another branch on its own**.

This controller supplies the missing *GitHub main → Lovable integration branch*
forward merge while keeping production deployment independent.

**Initial verified baseline (Nov 6, 2026):**
- Main `88de3533da1a8fad64e0664cb810b322ee424719` (Batch 195.1 PR #222).
- Integration `3ec5f7cd193ff49d03782781421fcbae3bd4678e`.
- Lovable project reported the integration tip above.
- At that baseline the integration contained main (no missing commits).
- Past divergence included 84 Lovable-side commits. Do not squash or rewrite them.

## Components

| File | Responsibility |
| --- | --- |
| `.github/workflows/lovable-source-forward-sync.yml` | Runs on `main` push, manual dispatch, and relevant PRs. Check job is always read-only; apply job has a separate activation gate. |
| `scripts/lovable-sync/forward-sync.mjs` | Fetches both branch heads; creates disposable detached Git worktree; tests ordinary non-fast-forward merge, allowlisted overlay and ancestry; optionally pushes a normal fast-forward to integration. Emits status artifact. |
| `scripts/lovable-sync/forward-sync.test.mjs` | Disposable local Git regression fixtures (allowlisted branch names + `STOCKSIST_LOVABLE_SYNC_TEST_MODE` for apply). No production or remote GitHub writes. |
| `scripts/lovable-sync/batch211-github-e2e.mjs` | Optional GitHub E2E: allowlisted disposable refs only — pair A (`cursor/_batch211_e2e_main`, `cursor/_batch211_e2e_integration`) for TEST 1–4, pair B (`cursor/_batch211_e2e_main_b`, `cursor/_batch211_e2e_integration_b`) for TEST 5. Aborts if any of those refs already exist on `origin`; deletes only refs this run created. Invoked by `.github/workflows/batch211-lovable-sync-e2e.yml` (manual `workflow_dispatch`). |
| `.lovable-sync-verify/status.json` / `status.md` | Workflow artifacts (gitignored), source facts only. Never proves deployed Edge binary identity. |

**Test-target mode (disposable refs only):** when `STOCKSIST_LOVABLE_SYNC_TEST_MODE=true` and both branch arguments are allowlisted under `cursor/_batch211_e2e_*`, apply may push without `STOCKSIST_LOVABLE_SYNC_ACTIVATED`. The exported `synchronize()` enforces the same rules (production pair requires activation; disposable pair requires test mode). Apply is blocked if either branch is the real `main` or `cursor/lovable-sync-from-main-20261024` while claiming test mode.

**E2E markers** live under `.lovable/` / `drizzle/migrations/` so the merged tree matches the overlay allowlist. Disposable commits stage only those paths so local `.lovable-sync-verify/` output is never pushed (that directory is gitignored).

Statuses:
- **SYNCED:** GitHub integration is a descendant of currently fetched main, with only allowed Lovable overlay relative to main; or an approved normal push just made it so.
- **BEHIND:** a clean merge is available but the check-only job has not pushed it.
- **CONFLICT:** Git merge, unrelated history or non-allowlisted source drift needs manual resolution; no push.
- **UNKNOWN:** remote unavailable, branch policy or persistent race prevents establishing a safe result.

**Lovable editor sync:** separate from Git branch sync. A GitHub status of SYNCED never alone establishes that the Lovable editor loaded the same commit. Verify via Lovable project active SHA or supported repo Git re-check. **Runtime:** Edge/Fly/Vercel remain UNKNOWN without separate platform evidence under Batch 210 / ISS-039.

## Safeguards

1. Hardcode the target integration branch; NEVER update `main` or `cursor/chat-single-pass-v1`.
2. Fetch latest `origin/main` and remote integration on each attempt. Fail if history is unrelated or a branch cannot be read.
3. Merge with `git merge --no-ff` only in disposable detached worktree. No rebase, reset, force push, or history rewrite.
4. Do not auto-resolve content conflicts. Fail closed and keep remote integration intact.
5. Compare merged tree **to current main** and allow drift ONLY in these known Lovable-owned locations:
   - `.lovable/**`
   - `drizzle/migrations/**`
   - `bun.lock`
   - `src/integrations/supabase/types.ts`
   - `supabase/functions/mcp/index.ts` (generator-owned; do not hand edit in main)
   - `supabase/functions/sync-screener-data/handler_test.ts` (existing Lovable-specific test overlay)
   Any new overlay path or production-code change not in this list stops automatic synchronization until a human reviews the ownership exception.
6. Re-fetch main and integration immediately before push. If they change, rebuild/revalidate from the latest refs. Normal push rejects a concurrent Lovable bot push; retry boundedly. Never use `--force`.
7. GitHub Actions concurrency serializes this controller's own executions but does not lock Lovable bot pushes; normal Git ancestry protects against overwrites.
8. Record main SHA, integration before/after SHA, attempt count, status, and failure summary; never record secrets.
9. Keep `STOCKSIST_LOVABLE_SYNC_ACTIVATED` repository variable **unset** at PR creation/merge. Without literal value `true`, all runs are check-only (no writes).
10. The apply job needs GitHub Actions `contents: write`; if repository Actions token permissions or integration branch protections deny pushes, do not bypass them. Return UNKNOWN and request owner review.

## Validation before activation

1. Review PR and GitHub Actions check (Node 24, no external dependencies): `node --test scripts/lovable-sync/forward-sync.test.mjs`.
2. Run `node scripts/lovable-sync/forward-sync.mjs --mode=check` on the ephemeral checkout or in the PR workflow. Inspect the uploaded artifact.
3. Verify current main is ancestor of the integration branch and the Lovable editor has that integration SHA.
4. Verify ownership allowlist against actual GitHub `main...integration` diff. Review exceptions rather than broadening blindly.
5. After separate owner approval, verify GitHub Actions permissions/branch restrictions and **then** set repository Actions variable `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true`. An owner-approved manual `workflow_dispatch` with operation `apply` on `main` can test the first write. Observe target integration ref, Lovable editor sync and source parity. No Edge deploy is implied.
6. When activated, approved pushes to `main` perform check then gated apply automatically. Any CONFLICT/UNKNOWN aborts. If new manual Lovable edits are present, preserve them and inspect before resolving.
7. Optionally use Batch 210 source-provenance manifests to record intended main/integration SHAs. **Do not** label Lovable Edge runtime MATCH from this evidence.

## Emergency disable / recovery

- Disable repository variable by removing it or setting it to `false`. The next runs remain check-only; no rollback or live backend change needed.
- If GitHub → Lovable webhook delivery misses a push, compare reported editor active SHA to remote integration before taking action. Do **not** force-push to refresh. Use Lovable Git's supported refresh/re-check, or approved non-destructive empty commit as a dedicated follow-up, only after preserving unsynced Lovable work.
- For conflicts, keep integration branch untouched. Resolve on a dedicated Cursor worktree/branch using a regular merge and owner review; then push a **fast-forward** only after confirming all Lovable-only changes survive.
- If a bad merged source reached integration, do not force-reset/rebase it. Make a corrective commit or reviewed revert on the appropriate branch, follow owner-approved release procedures separately.

## Out-of-scope / deferred

A Lovable API bridge, personal Supabase CLI token, production Edge binary fingerprint collector, automatic database migration, automatic Edge deployment and Fly release are **not** introduced. Keep ISS-039 for live-binary provenance, ISS-034/ISS-024 for scanner market-session acceptance, and ISS-028 for Catalyst production acceptance. No closed issues are reopened by this source-only batch.
