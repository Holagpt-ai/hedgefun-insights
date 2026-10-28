# Batch 190 — CPU-safe staged screener sync (Architecture A)

**Issue:** ISS-034 (P0 open until production demonstrates fresh six-tab publication)  
**Approved base:** `main` @ `4eaa850478ca22d14d653f9e76c04b231b0b6070`

## Decision

**Architecture A — bounded, resumable Edge invocations with durable Postgres staging.**

PR #194 reduced local wall-clock ~5× but production still **CPU Time exceeded** at ~13,262 symbols before `replace_screener_results_generation_v1`. Further single-request micro-optimization is explicitly out of scope.

**Not chosen:** Fly worker offload (Batch 190 does not expand Fly credentials, deploys, or schedules).

## Behavior

1. **Cron / start (`action: cron`)** — One Polygon snapshot triple (universe + gainers + losers), optional radar previous-close overlay, immutable `observation` context (`nowMs`, session kind, `syncRunId`, `syncedAt`). Job persisted with full ticker JSON.
2. **Chunk steps (`action: continue`)** — Each invocation processes at most `SCREENER_SYNC_CHUNK_SIZE` (2200) symbols: radar diagnostics, main-tab qualifiers (merge-only), gappers/NHL/primary evidence accumulators, NHL candidate map merge. Saves progress; schedules next step via `SYNC_SECRET` Bearer to the same function URL (separate Edge CPU budget).
3. **Finalize** — Global `finalizeMainUniverseSelections` + `finalizeNhlSelections`, gainers/losers on frozen provider slices, `buildTabEvaluationEvidenceFromChunkAccums`, generation-preserve gate, atomic `replace_screener_results_generation_v1`, day-trade capture once, job `published`.

**Monolithic path** remains when `SCREENER_SYNC_STAGED` is `0` or `off` (default).

## Enable staged mode (production — owner / Lovable)

| Step | Owner |
| --- | --- |
| Apply migration `20261028200000_screener_sync_generation_staging_v1.sql` | Lovable Cloud |
| Deploy Edge `sync-screener-data` with Batch 190 head | Lovable Cloud |
| Set secret/env `SCREENER_SYNC_STAGED=1` (or `chain`) | Lovable Cloud |
| Confirm `SYNC_SECRET` continues to authorize self-continue POSTs | Lovable Cloud |
| Do **not** change cron job 25 interval | — |

Rollback: set `SCREENER_SYNC_STAGED=0`, redeploy prior Edge bundle; last published generation remains until monolithic path succeeds.

## Files (implementation)

- `supabase/migrations/20261028200000_screener_sync_generation_staging_v1.sql` — **not applied in Cursor**
- `supabase/functions/_shared/screeners/sync-staging-*`, `sync-chunk-processor.ts`, `sync-orchestrator.ts`
- `supabase/functions/_shared/screeners/selection.ts` — chunked merge/finalize
- `supabase/functions/_shared/screeners/evaluation-evidence-chunk.ts`
- `supabase/functions/sync-screener-data/handler.ts` — staged branch + finalize
- `supabase/functions/sync-screener-data/sync-staged-handler.ts`

## Validation (local)

```sh
deno test --frozen --no-check supabase/functions/_shared/screeners/chunked-selection-parity_test.ts
deno test --frozen --no-check supabase/functions/_shared/screeners/sync-orchestrator-concurrency_test.ts
deno test --frozen --no-check supabase/functions/_shared/screeners/sync-screener-universe-cpu_test.ts
npm run typecheck && npm run build
```

**Note:** Local Deno timing does not prove Supabase Edge billed CPU per chunk; post-deploy, review Lovable logs for chunk + finalize invocations completing under CPU limit.

## Operational limits

- Staging rows hold full universe JSON (~13k tickers) per generation — monitor table size.
- Self-continue requires outbound fetch from Edge to project function URL (same as existing sync patterns using `SYNC_SECRET`).
- Incomplete generations abort after `SCREENER_SYNC_JOB_TTL_MS` (25m); they do not publish.

## ISS-034

Remains **OPEN** until a production cron cycle completes staged chunking + finalize and feed shows a fresh six-tab generation consistent with evaluation evidence.
