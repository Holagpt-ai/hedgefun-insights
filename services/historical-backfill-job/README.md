# Historical Intelligence production backfill (Fly)

One-shot server-side rollout using the same engine and PostgreSQL repositories as the local runner. Does not fetch minute bars or run deep reconstruction.

## Runtime secrets (never commit)

- `HISTORICAL_PRODUCTION_DATABASE_URL` — direct Postgres URL for project `zcjptaolpumhtlwhlemq`
- `POLYGON_API_KEY`

## Deploy (does not start the job)

```bash
fly deploy --config fly.historical-backfill.toml
fly secrets set -a stocksist-historical-backfill-job \
  HISTORICAL_PRODUCTION_DATABASE_URL='postgres://...' \
  POLYGON_API_KEY='...'
```

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
