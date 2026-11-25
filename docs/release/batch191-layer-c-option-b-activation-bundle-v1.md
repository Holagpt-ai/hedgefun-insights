# Layer C + Option B reconcile — production SQL activation bundle

**Status:** Git-only — **NOT applied** in Cursor. Owner executes via connected Lovable SQL integration with explicit authorization.

**Target:** Scanner Edge **v530**, Option B **ON**, pre–Layer C job columns absent.

**GitHub `main` at authoring:** `97c2eb0348da33c6e0216aa743d9ca358b2f458b` (post #273).

---

## Execution order (single maintenance window)

Apply **both** files in one transaction when possible. Do **not** apply Layer C without the Option B reconcile follow-on in the same window — intermediate reconcile would reject legitimately published degraded-Gappers feeds.

| Step | File | Purpose |
| --- | --- | --- |
| 1 | `supabase/migrations/20261116153000_screener_sync_generation_tab_evidence_v1.sql` | Job evidence columns; assert; publish/complete/reconcile (pre–Option B reconcile) |
| 2 | `supabase/migrations/20261125203000_screener_option_b_reconcile_evidence_v1.sql` | `validate_screener_feed_reconcile_evidence_v1`; Option B–aware reconcile |

**No Edge deploy required** if production already runs scanner **v530** with Option B ON and handler compatibility verified.

---

## Preconditions (read-only)

```sql
SET statement_timeout = '120s';
SET lock_timeout = '15s';

-- Layer C not yet applied
SELECT version FROM supabase_migrations.schema_migrations
WHERE version IN ('20261116153000', '20261125203000');
-- Expect 0 rows for both.

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'screener_sync_generation_jobs'
  AND column_name IN ('tab_evaluation_evidence', 'published_synced_at', 'published_nhl_baseline_status');
-- Expect 0 rows.

-- No in-flight generation with live lease
SELECT id, status, next_chunk_index, total_chunks,
       lease_expires_at, finalize_lease_expires_at, updated_at
FROM public.screener_sync_generation_jobs
WHERE status IN ('chunking', 'finalizing')
  AND (
    (lease_expires_at IS NOT NULL AND lease_expires_at > now())
    OR (finalize_lease_expires_at IS NOT NULL AND finalize_lease_expires_at > now())
  )
ORDER BY updated_at DESC
LIMIT 5;
-- Expect 0 rows before apply.
```

---

## Atomic apply procedure (Lovable SQL)

```sql
BEGIN;
SET LOCAL statement_timeout = '300s';
SET LOCAL lock_timeout = '30s';

-- Paste full contents of 20261116153000_screener_sync_generation_tab_evidence_v1.sql
-- then full contents of 20261125203000_screener_option_b_reconcile_evidence_v1.sql

COMMIT;
```

**Do not** use bulk migration tooling. **Do not** mark ledger rows unless Lovable integration records them automatically.

---

## Post-activation verification (read-only)

```sql
SELECT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'assert_screener_tab_evaluation_evidence_v1'
) AS assert_exists,
EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'validate_screener_feed_reconcile_evidence_v1'
) AS validate_reconcile_exists;

SELECT pg_get_functiondef(p.oid) LIKE '%validate_screener_feed_reconcile_evidence_v1%'
       AS reconcile_uses_option_b_gate
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'reconcile_screener_sync_staged_publish_v1';

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'screener_sync_generation_jobs'
  AND column_name IN ('tab_evaluation_evidence', 'published_synced_at', 'published_nhl_baseline_status');
-- Expect 3 rows.
```

Observe **one** natural scanner publication after apply: job row should populate `tab_evaluation_evidence` on publish/complete (not NULL for new `published` jobs).

---

## Failure recovery

| Failure | Action |
| --- | --- |
| `ROLLBACK` during apply | No partial state; re-run preflight; retry single transaction when quiescent |
| Layer C applied but step 2 missing | **Block** further publishes until step 2 applied — reconcile rejects Option B feeds |
| Post-apply publish `publish_complete_rejected` | Confirm Edge v530; evidence payload non-null; do not disable Option B without owner ticket |
| Ledger / version drift | Record actual Lovable state; **do not** hand-edit `schema_migrations` without owner reconciliation |

Forward fix for reconcile-only (if Layer C columns already exist): apply **only** `20261125203000_screener_option_b_reconcile_evidence_v1.sql`.

---

## Explicit non-goals

- No Option B secret change (remains **ON**).
- No Fly / Vercel / cron edits.
- No historical `tab_evaluation_evidence` backfill for pre-Layer C `published` jobs.