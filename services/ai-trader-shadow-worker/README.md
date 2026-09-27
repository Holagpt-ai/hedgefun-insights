# AI Trader Shadow worker

This directory is a **future** deployment boundary.

Sprint 3C.1 authors a real bootstrap package. It does **not** deploy this worker, create a cron, or write `SHADOW` to production.

Runtime code lives in `src/lib/ai-trader/runtime/`.

## Do not start

`npm start` refuses on purpose.

Invoke only from a trusted server after human activation review:

1. Apply `20260928000000_ai_trader_watchlist_transition_rpc_v1.sql` via Lovable (not Cursor).
2. Confirm `evaluateShadowReadiness` is `READY`, including `transitionRpcPresent`.
3. Set `AI_TRADER_SHADOW_WORKER_ALLOW_EXECUTE=1` only then.
4. Call `runShadowWorkerBootstrap(deps, readiness, { allowExecute: true })`.

Required future env (never `VITE_*`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Uses the existing Stocksist Supabase. No second database.

OFF mode: the cycle returns `SKIPPED` / `OPERATING_MODE_OFF` and writes nothing.
