# Historical Intelligence production backfill (Fly)

One-shot server-side rollout using the same engine as the local runner. Does not fetch minute bars or run deep reconstruction.

## Runtime secrets (never commit)

Preferred on Fly (Supabase Data API, service role):

- `SUPABASE_URL` — must reference project `zcjptaolpumhtlwhlemq`
- `SUPABASE_SERVICE_ROLE_KEY` — or `SUPABASE_SECRET_KEY` if the project uses the newer secret-key format
- `POLYGON_API_KEY`

Optional alternative (direct Postgres, local tooling):

- `HISTORICAL_PRODUCTION_DATABASE_URL`

When both a direct Postgres URL and Supabase credentials are set, direct Postgres is used.

Apply migration `0010_historical_backfill_supabase_rpc_v1.sql` on production before the Supabase path.

## Deploy (does not start the job)

```bash
fly deploy --config fly.historical-backfill.toml
fly secrets set -a stocksist-historical-backfill-job \
  SUPABASE_URL='https://zcjptaolpumhtlwhlemq.supabase.co' \
  SUPABASE_SERVICE_ROLE_KEY='...' \
  POLYGON_API_KEY='...'
```

## Connectivity check (no market-data canary)

After secrets and migration `0010` are in place:

```bash
fly secrets set -a stocksist-historical-backfill-job HISTORICAL_BACKFILL_CONNECTIVITY_ONLY=1
fly scale count 1 --process-group backfill -a stocksist-historical-backfill-job
fly logs -a stocksist-historical-backfill-job
fly secrets unset -a stocksist-historical-backfill-job HISTORICAL_BACKFILL_CONNECTIVITY_ONLY
fly scale count 0 --process-group backfill -a stocksist-historical-backfill-job
```

Validates read/write against job `0ab000ee-6f58-4e21-ba68-4a095a97f584` (override with `HISTORICAL_BACKFILL_CONNECTIVITY_JOB_ID` if needed).

## Start the one-time job

```bash
fly scale count 1 --process-group backfill -a stocksist-historical-backfill-job
fly logs -a stocksist-historical-backfill-job
```

When logs show `rollout_complete`, stop the machine:

```bash
fly scale count 0 --process-group backfill -a stocksist-historical-backfill-job
```

Restart after failure resumes the latest `RUNNING` / `PAUSED` / `FAILED` job, then continues with the next symbol batch.
