# AI Trader Shadow worker

Trusted server process for the existing AI Trader Shadow runtime. It does not change `ai_trader_runtime.operating_mode`.

While that mode is `OFF`, each cycle is `SKIPPED` / `OPERATING_MODE_OFF` and writes nothing.

Runtime code lives in `src/lib/ai-trader/runtime/`. This package is orchestration only.

## Run

From this directory, after server environment is present:

```bash
npm start
```

`npm start` builds a Node bundle and runs it. Importing the module does not start a cycle.

Required server environment (names only, never `VITE_*`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- one direct Postgres URL: `HISTORICAL_PRODUCTION_DATABASE_URL`, `LOVABLE_DB_MIGRATION_URL`, `SUPABASE_DB_URL`, or `DATABASE_URL`

Optional:

- `AI_TRADER_SHADOW_WORKER_POLL_INTERVAL_MS` (default `60000`)
- `AI_TRADER_SHADOW_WORKER_ID`
- `AI_TRADER_SHADOW_WORKER_LOG_LEVEL` (`info` or `error`)
- `AI_TRADER_SHADOW_WORKER_HEALTH_PORT` (default `8080`)
- `AI_TRADER_SHADOW_WORKER_GIT_SHA`

See `.env.example`. Do not commit values.

## Deploy

Fly app `stocksist-ai-trader-shadow-worker`, from the repository root:

```bash
fly deploy . --config services/ai-trader-shadow-worker/fly.toml --dockerfile services/ai-trader-shadow-worker/Dockerfile
```

Set the server environment with `fly secrets set`. Do not put secrets in `fly.toml`.

Health: `GET /health` reports process status, database reachability, operating mode, readiness, and the last cycle disposition. It does not return credentials.

This worker does not activate `SHADOW`, `PAPER`, `CONTROLLED_LIVE`, or `LIVE`.
