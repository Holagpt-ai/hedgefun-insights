# AI Trader Shadow worker

This directory is a **future** deployment boundary.

Sprint 3C authors the runtime. It does **not** deploy this worker, create a cron, or write `SHADOW` to production.

Runtime code lives in `src/lib/ai-trader/runtime/`.

Invoke only from a trusted server after human activation review:

`runShadowWorkerEntrypoint(deps, { allowExecute: true })`

Required future env (never `VITE_*`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Uses the existing Stocksist Supabase. No second database.
