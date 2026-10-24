# Edge Function release and rollback (Lovable Cloud)

Use when deploying Supabase Edge Functions to production project **`zcjptaolpumhtlwhlemq`**. **Lovable Cloud** executes production deploys. GitHub **`main`** holds authoritative source. A git SHA is **not** the same as a deployed Edge revision until Lovable Cloud confirms deploy.

Do not deploy from this document alone. This is the safety procedure only.

## Before replacement

1. **Record the approved source SHA** from GitHub `main` (or the merge commit named in the release batch). Example: `1072343455023afc1cb1fbd9007258e80308dd75` for AI Analyst `chat` V2.
2. **In Lovable Cloud**, open managed Supabase for project `zcjptaolpumhtlwhlemq` and capture **before** state for the target function (e.g. `chat`):
   - Deployed **version id** or **deployment timestamp** shown in Lovable / Supabase function history (if exposed).
   - Any **rollback pointer** Lovable provides for the previous active revision.
3. **Preserve a rollback package** using whichever of these Lovable Cloud supports (use all that are available):
   - **Previous revision redeploy:** note the version id Lovable can redeploy without rebuilding from git.
   - **Git snapshot:** tag or commit SHA that was **approved for the last known-good deploy** (metadata only until Lovable confirms it matches live).
   - **Source tree export:** if Lovable offers “download deployed bundle” or equivalent for Edge Functions, store that artifact with the version id and timestamp. If not offered, record that gap explicitly.
4. Write one row to `docs/DEPLOYMENT_STATUS.md` (or the batch handoff): function name, previous version id, previous deploy time, intended source SHA, operator.

If step 2 or 3 cannot be completed and no recoverable previous revision is identified, **stop** and mark the release **BLOCKED**. Do not replace production.

## Deploy (executor: Lovable Cloud)

1. Sync Lovable from **`cursor/lovable-sync-from-main-20261024`** after it contains the approved `main` commits (integration branch carries Lovable-generated files plus `main`).
2. Deploy **only** the functions named in the batch (e.g. **`chat` only** for AI Analyst V2). Supabase bundles transitive `supabase/functions/_shared/**` imports automatically; do not deploy shared paths as separate functions.
3. Do not change secrets, cron, migrations, or unrelated functions unless the batch says so.
4. After deploy, record **new** version id, deploy timestamp, and source SHA Lovable used. Treat the platform version id as the live revision; the git SHA is provenance only.

## Post-deploy verification (minimal)

- `OPTIONS` and one authorized smoke request on `/functions/v1/<function>`.
- Batch-specific checks (for `chat`: general SSE stream, current-catalyst attribution, graceful enrich failure, no new error spike in Lovable Cloud logs).
- Compare behavior to pre-deploy smoke only when the batch requires it.

## Rollback

1. Prefer **redeploy previous version** through Lovable Cloud using the version id captured in “Before replacement”.
2. If only a git SHA is available, redeploy from the **last known-good approved commit** through Lovable Cloud and confirm the platform reports a new revision; then re-run minimal smoke tests.
3. Update `docs/DEPLOYMENT_STATUS.md` with rollback time, restored version id, and result.
4. Keep **`ISS-015`** open until production behavior matches the approved activation criteria.

## Known limitations (this repo)

| Capability | Status |
| --- | --- |
| Cursor session default access to Supabase Management API / CLI | **Not assumed** — route through Lovable Cloud |
| Git SHA equals live Edge revision | **Not assumed** — record platform version id |
| Automated version capture from Cursor without Lovable | **Unavailable** — blocker until Lovable provides history or export |
| Personal `SUPABASE_ACCESS_TOKEN` | **Not default** — only if Lovable explicitly cannot perform a step and the gap is documented |

## AI Analyst `chat` V2 (reference)

- Approved source: PR #164 on `main` (`10723434`).
- Scope: **`chat`** only; includes `_shared/ai-analyst/*` imports.
- Production activation remains **BLOCKED** (`ISS-015`) until Lovable Cloud deploy and verification complete.
