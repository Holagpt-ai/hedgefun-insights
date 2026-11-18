# AM Inbox — `late_session_handoff_list_active_v1` ACL correction V1

**Scope:** SQL migration + pgTAP ACL regression only. **No** frontend, Edge, Fly, cron, secrets, or production apply from Cursor.

**Baseline:** GitHub `main` at branch open (post ISS-049 Fly worker `47f2136b`).

**Related:** ISS-025 (authenticated AM Inbox UI acceptance — unchanged). Qualified-candidate fallback UI is **deployed** — **do not modify** in this batch.

## Production finding (owner-reported)

| Property | Production state |
| --- | --- |
| Function | `public.late_session_handoff_list_active_v1(date)` |
| `SECURITY DEFINER` | Yes |
| `anon` EXECUTE | **Yes** (defect) |
| `authenticated` EXECUTE | Yes (intended) |
| Subscription / account gate inside RPC | **No** (reads global handoff table via definer) |

Direct table `SELECT` for `late_session_continuation_handoffs` is already revoked for `anon` / `authenticated` (Launch Cleanup V1). Anonymous callers could still invoke the definer RPC and receive the full filtered row set.

## Root cause (git + Supabase behavior)

1. **20260922200000** created the RPC with `REVOKE ALL … FROM PUBLIC` and `GRANT EXECUTE … TO authenticated, service_role` — it did **not** `REVOKE … FROM anon` explicitly (unlike later hardening elsewhere in the repo).
2. **20260923220000 Launch Cleanup V1** hardened **upsert** and **expire** with `REVOKE ALL … FROM PUBLIC, anon, authenticated`, but for **list_active** it only re-issued `GRANT EXECUTE TO authenticated, service_role` **without** an explicit `anon` revoke (see `drizzle/migrations/0038_launch_cleanup_security_v1.sql` — same gap).
3. In Supabase, new functions often receive **direct** `anon` EXECUTE via platform default privileges; `REVOKE FROM PUBLIC` does **not** remove a direct `anon` grant. `CREATE OR REPLACE FUNCTION` **preserves** existing ACLs (see comment in `journal_function_acl_hardening.test.sql`).
4. **No approved product requirement** makes this RPC public: AM Inbox uses the authenticated Supabase browser client (`late-session-handoff-client.ts`). Public marketing routes do not depend on this RPC.

## Intended access policy

| Role | `list_active_v1` EXECUTE |
| --- | --- |
| `anon` | **Deny** |
| `authenticated` | **Allow** |
| `service_role` | **Allow** (Edge/cron writers use other RPCs; list for ops/tests) |

Session-date filtering, return shape (`SETOF late_session_continuation_handoffs`), and AM Inbox client behavior are **unchanged**.

## Forward correction (not applied in production)

Migration: `supabase/migrations/20261118193000_late_session_handoff_list_active_acl_v1.sql`

```sql
REVOKE ALL ON FUNCTION public.late_session_handoff_list_active_v1(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.late_session_handoff_list_active_v1(date) TO authenticated, service_role;
```

## Regression checks

| Layer | Command / artifact |
| --- | --- |
| ACL (pgTAP) | `supabase test db --local supabase/tests/database/late_session_handoff_function_acl.test.sql` (also wired in `scripts/ci/journal-db-runtime.sh` **Clean database** job) |
| Journal disposable bootstrap | `write_disposable_prereqs` stubs Drizzle-only security-intelligence tables before `20260922160000_*`; ephemeral `20260922225000_ci_disposable_behavior_profile_fn_drop.sql` drops `behavior_profile_list_candidates_v1` so `20260922230000_*` can widen its OUT row (42P13 on fresh runners). **CI-only** — not production migrations. |
| AM Inbox client (no code change) | `npm run test -- src/lib/am-inbox/__tests__/batch217-am-inbox-production-readiness.test.ts src/lib/am-inbox/__tests__/batch186-am-inbox-continuation-acceptance.test.ts src/lib/am-inbox/__tests__/am-inbox-late-session.test.ts` |
| Continuation scoring | **No changes** in this batch (see test evidence below) |

### Reported AM Inbox Vitest window (local, Nov 18 2026)

Focused continuation / AM Inbox suites (batch12 + batch186 + batch217 + am-inbox-late-session): **37 passed / 38 total**.

**Separate pre-existing failure (not in scope):** `batch12-next-session-continuation-integrity.test.ts` → *"uses conservative ranking when metric kind is unknown"* — RVOL ranking expectation vs `continuationRankingRvolFromContext` (Batch 12 RVOL debt; documented in `batch174-175-monday-acceptance-inbox-v1.md` and master backlog **54/55** legacy item). **Do not conflate** with this ACL batch.

## Production activation requirements

1. **Owner approval** to apply SQL on Lovable Cloud project `zcjptaolpumhtlwhlemq` (single migration).
2. Apply **only** `20261118193000_late_session_handoff_list_active_acl_v1.sql` via Lovable Cloud migrations — not ad hoc personal Supabase CLI against production.
3. Post-apply read-only verify: `has_function_privilege('anon', …, 'EXECUTE')` → false; authenticated → true.
4. Optional smoke: signed-in AM Inbox pre-market load unchanged (ISS-025 matrix).
5. **No** Edge redeploy required for ACL-only change.

**Stop before merge or production migration** unless owner explicitly approves the next step.