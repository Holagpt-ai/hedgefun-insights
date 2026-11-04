# Batch 190.14 — CPU-safe staged finalize (release-safety)

**Priority:** P0 (ISS-034 publication reliability)  
**PR:** [#216](https://github.com/Holagpt-ai/hedgefun-insights/pull/216)  
**Scope:** Edge `sync-screener-data` staged **finalize** path only (no migrations).

## Production failure (preserved)

**2026-11-04 20:55:47 UTC** — Lovable `sync-screener-data` **v506**: seven of seven chunks completed; **finalize** returned **HTTP 546** (`CPU Time exceeded`); finalize lease remained held; **no new generation published**. Failure occurred **before** atomic publication.

## Root cause (code)

Finalize replayed **full-universe** CPU work on the hot path before publish:

1. **Gainers/losers** — redundant qualify buffer (universal qualifier) plus tab evidence **re-scans** for `qualified_count` and, in extended sessions, **`volume_active`** on the full 13k snapshot when provider G/L lists are empty.
2. **Diagnostics** — stage timings only at finalize **end**; a CPU kill mid-stage left no enter/exit breadcrumbs.
3. **Day-trade capture deferral** — did not reduce pre-publish CPU; `captureDayTradeQualificationFromSync` still runs heavy sync work before its first `await` when invoked.

## Fix (release-safety revision)

| Change | Effect |
| --- | --- |
| `gainersLosersUniverseQualifiedCount` / optimized `selectGainersLosersFromUniverse` | No redundant 13k qualify copy; rank reads universe in place |
| `gainersLosersQualifiedCount` + `gainersLosersVolumeActiveCount` on chunk evidence | Reuses chunk `primaryAccum.volumeActive` for full-snapshot G/L in extended sessions — skips second 13k volume scan |
| `build_evidence` finalize stage + `logFinalizeStageEnter` / `logFinalizeStageExit` | Enter/exit logs on merge, build_rows, build_evidence, preserve_check, atomic_publish, complete_publish |
| **`await captureDayTradeQualificationFromSync`** after `completePublish` | Lifecycle consistency after atomic publish (not deferred) |
| `batch190-14-finalize-benchmark.ts` | Before/after **this PR** on 13,262 symbols (regular / pre-market / after-hours) |

**Unchanged:** chunk leases, atomic publish RPC, Batch **190.12** reconcile, Batch **190.13** cron `{}` normalize, six tabs, volume-first ranking, Five Pillars.

## Local benchmark (not Edge billed CPU)

Run:

```sh
deno test supabase/functions/_shared/screeners/batch190-14-finalize-cpu_test.ts --allow-read
```

Tests log `[batch190-14-finalize-benchmark]` with `before_pr216` vs `after_pr216` timings (`merge_selections_ms`, `gl_selection_ms`, `build_evidence_ms`, `rpc_payload_ms`, `total_finalize_cpu_path_ms`) per session. Capture those numbers in the PR body after CI/local run; local elapsed ≠ Supabase Edge CPU.

Deterministic tests assert evidence parity (qualified_count, status) — not flaky ms inequalities.

## Tests

- `supabase/functions/_shared/screeners/batch190-14-finalize-cpu_test.ts`
- `supabase/functions/_shared/screeners/sync-screener-universe-cpu_test.ts`
- Critical screener Deno regressions workflow
- `npm run typecheck` / `npm run build`

## Activation (owner)

1. Merge PR #216 to `main`.
2. **Lovable Cloud** deploy Edge **`sync-screener-data`** only (project `zcjptaolpumhtlwhlemq`).
3. Verify staged run: chunks 7/7 → finalize → `published`; logs show `staged_finalize_stage_enter` / `_exit` through `atomic_publish`; no **546** on ~13k universe.
4. Apply Batch **190.12** / **190.13** backend items separately if not already on production.

## Rollback

Redeploy prior `sync-screener-data` bundle from Lovable revision history. No schema rollback.
