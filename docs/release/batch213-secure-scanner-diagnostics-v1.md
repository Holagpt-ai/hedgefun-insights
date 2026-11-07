# Batch 213 — Operations Control Center: Secure Scanner Diagnostics V1

**Depends on:** Batch 212 (PR #224, `/admin/operations`). This PR is stacked on `cursor/batch212-operations-control-center-v1`. Merge #224 first, then retarget this PR to `main`.

**Migration:** `supabase/migrations/20261106200000_ops_scanner_diagnostics_read_v1.sql`. **Not applied.** It changes nothing until Lovable Cloud applies it after owner approval.

## What it adds

`public.get_ops_scanner_diagnostics_v1(p_job_limit integer DEFAULT 10) RETURNS jsonb`

- **Authorization inside the database.** `auth.uid()` must be non-null and `public.has_role(auth.uid(), 'admin')` must be true. Otherwise the function raises SQLSTATE `42501`. Anonymous callers, sessions without a JWT, members, and moderators are all rejected.
- **SECURITY DEFINER** with `SET search_path = ''`. Every table, function, and type is schema-qualified (`public.*`, `auth.uid()`, `pg_catalog.*`). The function is `STABLE` and its body contains no data or schema writes.
- **Privileges.** EXECUTE is revoked from `PUBLIC`, `anon`, and `service_role`, and granted only to `authenticated`. The helper `public.ops_diagnostics_redact_v1(text, integer)` is revoked from every role and can only be called by the definer.
- **Returned data (schema_version 1):**
  - Up to 20 newest jobs (default 10), each with: `id`, `sync_run_id`, `status`, `next_chunk_index`, `total_chunks`, `lease_expires_at`, `finalize_lease_expires_at`, `continue_last_at`, `continue_last_error` (redacted server-side, at most 300 characters), `abort_reason`, `abort_prior_synced_at`, `abort_tabs` (at most 6 entries of `tab`, `prior_status`, `candidate_status`, `triggered_preservation`), `publish_rows_inserted`, `publish_rpc_recorded_at`, `created_at`, `updated_at`.
  - `stranded_finalizing_count`: a count across all jobs, so an older stranded job is not hidden by the limit.
  - `calendar`: `today_et`, `loaded`, `latest_updated_at`, `max_session_date`, and the exception rows dated from today − 7 to today + 14 (`session_date`, `market_status`, the three ET times, `holiday_name`). The calendar `source` and `provider_as_of` columns are not returned.
- **Never returned:** `all_tickers`, `gainers`, `losers`, `merged_artifacts`, `nhl_baseline_snapshot`, `observation`, `lease_token`, `finalize_lease_token`, `state_version`, raw `abort_evidence`, candidate generation ids, or any other table's rows.
- **Not changed:** existing table grants (jobs and calendar stay service-role only), scanner execution, cron, publication RPCs, leases, provider feeds, Edge Functions, and existing migrations.

## UI wiring (reuses Batch 212)

- `readScannerDiagnostics()` in `src/lib/ops/sources.ts` replaces the Batch 212 constant "no read path" stub. If the function is missing (`PGRST202` / `42883`) it reports **Not configured**; a `42501` error reports **permission denied**. A bad payload reports an invalid response. None of these throw.
- `src/lib/ops/diagnostics.ts` validates the payload strictly and redacts it again on the client. It resolves the session from the exception calendar, which counts as verified only when the calendar is loaded and `max_session_date` is today (ET) or later.
- Existing classifiers: `classifyGenerationJob` now names the tab that triggered a retained prior generation. The scanner card turns **Degraded** when the newest finished generation failed or retained the prior one. The pipeline card turns **Failing** on any stranded `finalizing` job.
- With a verified calendar, a market holiday reads as **Not applicable**, and a genuinely stale publication on a normal weekday can reach **Failing**. The Batch 212 Degraded cap stays only while the calendar is unverified.

## Tests

- `supabase/functions/_shared/screeners/batch213-ops-diagnostics-postgres_test.ts` runs against a disposable Postgres in the CI job `Screener Deno regressions`. It checks:
  - ACL for each role and for PUBLIC
  - `prosecdef`, the empty `search_path`, and `STABLE`
  - rejection of anon, missing JWT, member, moderator, an unknown user, and `service_role`
  - that direct table grants are unchanged
  - the job-key whitelist and leak sentinels (tickers, artifacts, observation, NHL snapshot, candidate ids, lease tokens)
  - server-side redaction and length bounds
  - the abort-tab projection
  - the limit clamp (1000 becomes 20; 0 and −5 become 1; null becomes 10)
  - stranded jobs outside the window
  - the calendar window and returned columns
  - that the call is read-only (row counts and `updated_at` unchanged)
- Bootstrap: `supabase/tests/screener-sync-pg/02-batch213-auth-roles-and-default-grants.sql` stubs `auth.uid()` and copies `app_role`, `user_roles`, and `has_role`. It also **simulates Supabase default EXECUTE grants**, so the migration's explicit revokes are actually tested.
- Vitest: `src/lib/ops/__tests__/batch213-diagnostics.test.ts` covers parser boundaries, holiday and early-close sessions, snapshot classification, the adapter with a mocked PostgREST client, and the static migration contract. The Batch 212 tests were updated for the new input shape.

## Verification status (2026-11-06)

| Check | Result | Where |
| --- | --- | --- |
| `npm run typecheck`, `npm run build`, `npm run test:integrity`, `npm run integrity` | PASS | Local (no Docker) |
| Vitest `src/lib/ops`, `src/pages/admin` (83 tests) | PASS | Local |
| Full `npx vitest run` | 26 files fail, all also failing on `origin/main` `f2a3cdae`; none new | Local |
| `deno check` of the Postgres test | PASS | Local |
| **Postgres integration** `batch213-ops-diagnostics-postgres_test.ts` (8 tests) | **BLOCKED locally**: Docker Desktop crashed (Windows socket-access error on `sailor-ingest.sock`). Docker was not reset and its data was not deleted. | Local |
| Same 8 Postgres tests | **PASS** (job: 268 passed, 0 failed) | GitHub Actions `Screener Deno regressions` run `42317438845` on `7061c2ea`. This was a throwaway `postgres:16-alpine` service on the runner, not production. |
| Production apply / ACL / walkthrough | **NOT RUN**: needs separate approval | Lovable Cloud |

The CI database is a bootstrap stand-in. `auth.uid()`, `app_role`, `user_roles`, and `has_role` are copies from `supabase/tests/screener-sync-pg/02-…sql`, not the real Supabase auth schema. Production behavior must still be checked with the post-apply steps below.

## Migration dependencies

`20261106200000_ops_scanner_diagnostics_read_v1.sql` requires these objects to exist in production:

- `public.app_role` enum and `public.has_role(uuid, public.app_role)`: `20260522174654_391b7364…`
- `public.screener_sync_generation_jobs` with `publish_rows_inserted` / `publish_rpc_recorded_at` (`20261028220000`) and `abort_reason` / `abort_evidence` (`20261030210000`): base table `20261028200000`
- `public.market_session_calendar`: `20260813180000` (Lovable duplicate `20260814154207`)
- Supabase `auth.uid()`
- The roles `anon`, `authenticated`, `service_role`

The UI half depends on Batch 212 (PR #224). Without the migration the UI shows **Not configured**, and nothing breaks.

## Approval steps (owner)

1. Review and merge **PR #224** (Batch 212).
2. Retarget this PR to `main`, review it, and merge it. Merging changes git only.
3. **Separately approve** applying `20261106200000_ops_scanner_diagnostics_read_v1.sql` in **Lovable Cloud**. Afterward, check:
   - `SELECT has_function_privilege('anon', 'public.get_ops_scanner_diagnostics_v1(integer)', 'EXECUTE');` returns **false**
   - the same check for `authenticated` returns **true**, and for `service_role` returns **false**
   - `SELECT proconfig FROM pg_proc WHERE oid = 'public.get_ops_scanner_diagnostics_v1(integer)'::regprocedure;` shows `search_path=""`.
4. Open `/admin/operations` as an admin. The generation pipeline card should leave **Not configured**, and the jobs table should fill. Then confirm that a non-admin account cannot see the page, and that calling the RPC directly as a non-admin returns `42501`.
5. Rollback, if needed: `DROP FUNCTION public.get_ops_scanner_diagnostics_v1(integer); DROP FUNCTION public.ops_diagnostics_redact_v1(text, integer);` as a new corrective migration. The UI returns to **Not configured**.
