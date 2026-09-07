# SEC EDGAR V1B activation runbook

Human-controlled sequence. Do not skip steps.

This package does **not** deploy the function, set production secrets, apply cron, or write live rows.

## Preconditions

- `sync-sec-edgar-filings` is reviewed and approved for deploy
- `SEC_USER_AGENT` is a declared application identity (never commit the value)
- `SYNC_SECRET` already exists for server/cron functions
- `SEC_EDGAR_WRITE_ENABLED` is unset or `false`

## Sequence

1. Deploy `sync-sec-edgar-filings` (separate approved step).
2. Set `SEC_USER_AGENT`.
3. Keep `SEC_EDGAR_WRITE_ENABLED=false`.
4. Manually invoke once with `{"mode":"dry_run"}` and `Authorization: Bearer <SYNC_SECRET>`.
5. Inspect the sanitized aggregate output only.
6. Verify expected forms in `forms_found` and that `mapped_issuers` / `unmapped_issuers` look plausible.
7. Enable `SEC_EDGAR_WRITE_ENABLED=true`.
8. Invoke one controlled write: `{"mode":"write"}`.
9. Verify `catalyst_events` with the read-only SQL below. Do not mutate rows.
10. Confirm Catalyst cards show **Filing-Related News** + **SEC FILING**.
11. Rerun the same write request and confirm idempotency (`rows_upserted` near zero, no duplicate `dedupe_key`).
12. Only then consider cron — **not in this sprint**. After V1C, first confirm paging/checkpoint telemetry on dry-run, one write, and an idempotent second write. See `overlap-and-cadence.md`.

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

-- G. primary_document must remain null in V1B
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
