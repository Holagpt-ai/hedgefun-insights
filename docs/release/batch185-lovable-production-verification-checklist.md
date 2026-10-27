# Batch 185 — Lovable Cloud production verification (read-only)

**Do not apply migrations or deploy from this checklist alone.** Use it after PR **#187** merges to learn what production **already has** before proposing any remaining work.

## 1. Inspect all relevant applied migrations (do not replay old RPC bodies)

In Lovable Cloud → **Database → Migrations** (or `supabase_migrations.schema_migrations`), list **every applied version** that touches screener publication, not only the evidence migration.

Relevant git history (newest effective definition wins):

| Migration (git filename) | Typical effect on screener publish |
| --- | --- |
| `20260727200000_screeners_p1_r2_atomic_generation.sql` | Base `replace_screener_results_generation_v1` (3-arg) |
| `20260727203000_screeners_p1_r3_honest_volume_metrics.sql` | RPC body replace |
| `20260729235741_*.sql` / `20260730002653_*.sql` | RPC body replace |
| `20260813190000_screener_52w_baselines.sql` | 4-arg RPC (`p_nhl_baseline_status`) |
| `20260814154404_*.sql` | NHL/baseline RPC extensions |
| `20260914200000_screener_tab_evaluation_evidence_v1.sql` | `tab_evaluation_evidence` column + 5-arg RPC |
| `20260917180200_screener_rvol20d_results_rpc_v1.sql` | **Current git RPC** (5-arg + `rvol_20d` / row shape) |

**Rules:**

- Compare **applied** versions to this table. Note the **highest applied** screener RPC migration.
- **Never** “fix” production by re-applying an **older** `replace_screener_results_generation_v1` migration — that can **downgrade** a newer function (e.g. rvol20d) or drop the evidence parameter.
- If a migration is **missing**, apply only the **missing forward migrations in timestamp order** via Lovable Cloud after explicit approval — not a cherry-picked subset from an earlier batch.

Optional read-only inventory:

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version >= '20260727200000'
ORDER BY version;
```

(Adjust schema/table name if Lovable uses a different migrations table.)

## 2. Column: `screener_feed_state.tab_evaluation_evidence`

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'screener_feed_state'
  AND column_name = 'tab_evaluation_evidence';
```

**Pass:** one `jsonb` column. **Fail:** no row → client `publication_confirmed` only; Edge legacy PATCH cannot persist evidence.

## 3. Current effective RPC (required before any migration proposal)

Inspect **live** function metadata — not an old file from git:

```sql
SELECT
  p.proname,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'replace_screener_results_generation_v1';
```

**Pass (expected on current git `main`):** arguments include `p_nhl_baseline_status` **and** `p_tab_evaluation_evidence jsonb DEFAULT NULL`, plus row fields consistent with the latest applied RPC migration (e.g. `rvol_20d` after `20260917180200`).

**Fail:** fewer parameters → `sync-screener-data` uses 4-arg fallback + guarded PATCH (requires column + Edge **185.1** deploy).

Optional body spot-check (read-only):

```sql
SELECT left(pg_get_functiondef(p.oid), 400) AS definition_prefix
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'replace_screener_results_generation_v1';
```

Compare prefix to the **latest applied** migration file in git — not to an superseded earlier migration.

## 4. Edge deployment revision

Lovable Cloud → Edge Functions → **`sync-screener-data`**:

- Record deployed revision / source SHA.
- **Pass:** includes Batch **185.1** (`persistTabEvaluationEvidenceAfterLegacyRpc`, PATCH on `state_key` + `sync_run_id` + `rows_inserted`, response `tab_evaluation_evidence_persistence`).
- **Fail:** older revision — legacy PATCH may be unsafe or omit partial-failure telemetry.

## 5. Current feed generation snapshot (null-safe evidence)

```sql
SELECT
  state_key,
  sync_run_id,
  status,
  synced_at,
  rows_inserted,
  tab_counts,
  nhl_baseline_status,
  (tab_evaluation_evidence IS NOT NULL) AS has_evidence,
  (
    SELECT coalesce(array_agg(k ORDER BY k), ARRAY[]::text[])
    FROM jsonb_object_keys(COALESCE(tab_evaluation_evidence, '{}'::jsonb)) AS k
  ) AS evidence_tab_keys
FROM public.screener_feed_state
WHERE state_key = 'current';
```

Record: `sync_run_id`, `synced_at`, `tab_counts`, `has_evidence`, `evidence_tab_keys`. Symptom for Batch 185: `has_evidence = false` while `rows_inserted > 0`.

Optional:

```sql
SELECT tab_id, count(*) AS published
FROM public.screener_results
GROUP BY tab_id
ORDER BY tab_id;
```

## 6. Deployment order (only for confirmed gaps)

1. **Forward-apply missing migrations** in timestamp order (never re-run an older RPC over a newer one).
2. **Deploy Edge** `sync-screener-data` from merged `main` (185.1).
3. **Vercel** production (client `publication_confirmed` + partial parse).
4. **One screener sync** (existing ops/cron — not from Cursor unless approved).
5. Re-run sections 3 and 5; expect provider `evaluated` evidence when 5-arg RPC succeeds atomically.

## 7. Acceptance boundaries

- **Vercel only:** published rows → **Published results** + advisory; empty tabs stay **Evaluation evidence unavailable**.
- **Full provider evidence:** 5-arg atomic RPC + Edge deploy; client keeps persisted JSON when valid.

**Production state:** NOT VERIFIED in Cursor — complete sections 1–5 in Lovable Cloud and attach to PR **#187** or Session Handoff.
