# SEC EDGAR V1C activation runbook

Human-controlled sequence. Do not skip steps.

This package does **not** deploy the function, apply the checkpoint migration, set production secrets, apply cron, or write live rows.

The SQL file under `supabase/migrations` is executable by future migration tooling.
The comment "artifact only" / "not yet applied" means it has not yet been applied to production; it does **not** make the SQL inert.

## Preconditions

- `sync-sec-edgar-filings` is reviewed and approved for deploy
- SEC checkpoint migration `20260907180000_sec_edgar_sync_state_v1.sql` is reviewed
- `SEC_USER_AGENT` is a declared application identity (never commit the value)
- `SYNC_SECRET` already exists for server/cron functions
- `SEC_EDGAR_WRITE_ENABLED` is unset or `false`

## Sequence

1. Confirm the reviewed/merged SEC checkpoint migration.
2. Apply **only** the approved SEC checkpoint migration through the approved Supabase Cloud process.
3. Verify read-only:
   - table exists
   - RLS enabled
   - `anon` has no privileges
   - `authenticated` has no privileges
   - `service_role` has required access
   - no checkpoint row exists before bootstrap
4. Deploy `sync-sec-edgar-filings`.
5. Set `SEC_USER_AGENT`.
6. Keep `SEC_EDGAR_WRITE_ENABLED=false`.
7. Invoke dry-run: `{"mode":"dry_run"}` with `Authorization: Bearer <SYNC_SECRET>`.
8. Inspect sanitized aggregate output:
   - `checkpoint_present`
   - `pages_fetched`
   - `entries_scanned`
   - `forms_found`
   - `mapped_issuers` / `unmapped_issuers`
   - `rows_would_insert`
9. Enable `SEC_EDGAR_WRITE_ENABLED=true`.
10. Run one controlled write: `{"mode":"write"}`.
11. Verify `catalyst_events` and `sec_edgar_sync_state` with the read-only SQL below. Do not mutate rows.
12. Run a second write and verify idempotency (`rows_upserted` near zero, no duplicate `dedupe_key`, checkpoint revision advanced only by the successful write).
13. Only later approve cron — **not in this sprint**. See `overlap-and-cadence.md`.

## Invoke body contract

```json
{"mode":"dry_run"}
```

```json
{"mode":"write"}
```

Missing body or missing `mode` is `dry_run`. Unknown keys and unknown modes are rejected.

## Read-only verification SQL

Do not run these against production in this sprint.

```sql
-- Checkpoint table present + RLS
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'sec_edgar_sync_state';

-- Grant verification: anon/authenticated have nothing; service_role can manage
SELECT
  NOT has_table_privilege('anon', 'public.sec_edgar_sync_state', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.sec_edgar_sync_state', 'INSERT')
  AND NOT has_table_privilege('anon', 'public.sec_edgar_sync_state', 'UPDATE')
  AND NOT has_table_privilege('anon', 'public.sec_edgar_sync_state', 'DELETE')
  AND NOT has_table_privilege('authenticated', 'public.sec_edgar_sync_state', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.sec_edgar_sync_state', 'INSERT')
  AND NOT has_table_privilege('authenticated', 'public.sec_edgar_sync_state', 'UPDATE')
  AND NOT has_table_privilege('authenticated', 'public.sec_edgar_sync_state', 'DELETE')
  AND has_table_privilege('service_role', 'public.sec_edgar_sync_state', 'SELECT')
  AND has_table_privilege('service_role', 'public.sec_edgar_sync_state', 'INSERT')
  AND has_table_privilege('service_role', 'public.sec_edgar_sync_state', 'UPDATE')
  AS grants_ok;

-- Checkpoint row: 0 rows before bootstrap; 1 row after first successful write
SELECT
  stream_key,
  jsonb_array_length(anchor_accessions) AS anchor_count,
  revision,
  anchor_observed_at,
  last_success_at,
  pages_fetched
FROM public.sec_edgar_sync_state;

-- A. New direct SEC rows
SELECT count(*) AS sec_edgar_rows
FROM public.catalyst_events
WHERE provider = 'sec_edgar';

-- B. Count by form_type from facts
SELECT facts->>'form_type' AS form_type, count(*) AS n
FROM public.catalyst_events
WHERE provider = 'sec_edgar'
GROUP BY 1
ORDER BY n DESC;

-- C. Latest accession numbers
SELECT
  symbol,
  facts->>'accession_number' AS accession_number,
  published_at,
  source_url
FROM public.catalyst_events
WHERE provider = 'sec_edgar'
ORDER BY published_at DESC NULLS LAST
LIMIT 25;

-- D. Duplicate dedupe_key check
SELECT dedupe_key, count(*) AS n
FROM public.catalyst_events
WHERE provider = 'sec_edgar'
GROUP BY 1
HAVING count(*) > 1;

-- E. Rows with missing symbol
SELECT id, dedupe_key, provider
FROM public.catalyst_events
WHERE provider = 'sec_edgar'
  AND (symbol IS NULL OR btrim(symbol) = '');

-- F. Rows with missing source_url
SELECT id, dedupe_key, symbol
FROM public.catalyst_events
WHERE provider = 'sec_edgar'
  AND (source_url IS NULL OR btrim(source_url) = '');

-- G. primary_document must remain null
SELECT id, dedupe_key, symbol, facts->>'primary_document' AS primary_document
FROM public.catalyst_events
WHERE provider = 'sec_edgar'
  AND facts->>'primary_document' IS NOT NULL
  AND facts->>'primary_document' <> '';

-- H. source/provider breakdown for sec_filing_news
SELECT provider, count(*) AS n
FROM public.catalyst_events
WHERE event_type = 'sec_filing_news'
GROUP BY provider
ORDER BY n DESC;
```
