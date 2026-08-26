# scanner-stream-worker

Deno service that bootstraps and refreshes the 52-week high/low baseline used by
Stocksist scanners. It runs as a long-lived HTTP process so it is not bound by
Supabase Edge Function wall-clock limits.

The worker publishes the 52-week baseline and, when it holds the Radar V2.2
lease, consumes Massive second aggregates (`A.*`) to publish a compact top-20
momentum board. Privileged database writes go through the Lovable Cloud
`radar-worker-bridge` function using `RADAR_WORKER_SECRET`. The worker does not
use `SUPABASE_SERVICE_ROLE_KEY`. `MASSIVE_WS_MODE` selects
`wss://delayed.massive.com/stocks` or `wss://socket.massive.com/stocks`
(default delayed). Health stays up while both loops initialize.

## Required environment

Set these in the process environment or your host secret manager. Do not commit
credentials or put API keys in git.

| Variable                          | Required | Default   |
| --------------------------------- | -------- | --------- |
| `POLYGON_API_KEY`                 | yes      |           |
| `RADAR_BRIDGE_URL`                | yes      |           |
| `RADAR_WORKER_SECRET`             | yes      |           |
| `PORT`                            | no       | `8080`    |
| `MASSIVE_WS_MODE`                 | no       | `delayed` |
| `BASELINE_MIN_SESSIONS`           | no       | `120`     |
| `BASELINE_LOOKBACK_CALENDAR_DAYS` | no       | `366`     |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not required on the worker.
They remain server-side only inside the Lovable Cloud bridge function.

The process exits on missing or invalid required configuration and never prints
secret values.

## Local

From this directory, with the required variables already exported in your shell:

```bash
deno run --allow-net --allow-env src/main.ts
```

Or:

```bash
deno task start
```

Health:

```bash
curl http://127.0.0.1:8080/health
```

Tests (no network):

```bash
deno task test
```

## Docker

Build from the repository root so the image can copy both this service and
`supabase/functions/_shared/markets`:

```bash
docker build -f services/scanner-stream-worker/Dockerfile -t scanner-stream-worker .
```

Run with environment variables supplied at runtime (examples below use your
shell environment; do not bake keys into the image or compose files checked into
git):

```bash
docker run --rm -p 8080:8080 \
  -e POLYGON_API_KEY \
  -e RADAR_BRIDGE_URL \
  -e RADAR_WORKER_SECRET \
  -e PORT=8080 \
  scanner-stream-worker
```

The image entrypoint is `deno`. The container listens on `8080` and answers
`GET /health` as soon as the HTTP server starts, including while the first
baseline bootstrap is still running.

Send `SIGTERM` or `SIGINT` to stop the job loop, close the server, and exit 0.
