# Historical Intelligence production backfill (Fly)

One-shot server-side rollout using the same engine as the local runner. Does not fetch minute bars or run deep reconstruction.

## Runtime secrets (never commit)

Production Fly transport uses the existing Lovable Cloud **`radar-worker-bridge`** (no Supabase keys on Fly):

- `RADAR_BRIDGE_URL` — HTTPS URL for `radar-worker-bridge` on project `zcjptaolpumhtlwhlemq`
- `RADAR_WORKER_SECRET` — same shared secret as the Radar worker
- `POLYGON_API_KEY`

Optional local/dev only:

- `HISTORICAL_PRODUCTION_DATABASE_URL` — direct Postgres (local pilot tooling)

When both bridge credentials and a direct Postgres URL are set, **bridge wins**.

Apply migration `0010_historical_backfill_supabase_rpc_v1.sql` on production and deploy the updated **`radar-worker-bridge`** before the backfill worker.

## Deploy (does not start the job)

```bash
fly deploy --config fly.historical-backfill.toml
fly secrets set -a stocksist-historical-backfill-job \
  RADAR_BRIDGE_URL='https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/radar-worker-bridge' \
  RADAR_WORKER_SECRET='...' \
  POLYGON_API_KEY='...'
```

## Connectivity check (no market-data canary)

```bash
fly secrets set -a stocksist-historical-backfill-job HISTORICAL_BACKFILL_CONNECTIVITY_ONLY=1
fly scale count 1 --process-group backfill -a stocksist-historical-backfill-job
fly logs -a stocksist-historical-backfill-job
fly secrets unset -a stocksist-historical-backfill-job HISTORICAL_BACKFILL_CONNECTIVITY_ONLY
fly scale count 0 --process-group backfill -a stocksist-historical-backfill-job
```

Expect log event `connectivity_ok` for job `0ab000ee-6f58-4e21-ba68-4a095a97f584`.

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
