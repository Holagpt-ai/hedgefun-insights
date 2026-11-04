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

**Unchanged:** chunk leases, atomic publish RPC, six tabs, volume-first ranking, Five Pillars. Batch **190.12** SQL and Batch **190.13** cron body normalization are **already deployed** on Lovable Cloud — do not reapply either.

## Local benchmark (not Edge billed CPU)

Run:

```sh
deno test supabase/functions/_shared/screeners/batch190-14-finalize-cpu_test.ts --allow-read
```

Fixtures (2026-10-28, America/New_York, asserted via `resolveSyncSessionKind`): pre-market **07:35** (`pre-market`), regular **12:45** (`market`), after-hours **16:20** (`after-hours`).

Tests log `[batch190-14-finalize-benchmark]` with `before_pr216` vs `after_pr216`. `rpc_payload_ms` is `JSON.stringify` of mapped tab rows plus tab-evaluation evidence (not an empty placeholder). Local elapsed ≠ Supabase Edge CPU.

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
4. Do **not** reapply Batch **190.12** SQL or Batch **190.13** cron normalization. Both are already on production.

## Rollback

Preserved pre-190.14 application source is GitHub `main` **`3bd3ee68`** (parent of this PR). Redeploy `sync-screener-data` from that git snapshot through Lovable Cloud if 190.14 must be withdrawn. That identifies source to stage; it does **not** restore a specific live Edge revision id. No schema rollback. Do not reapply 190.12 or 190.13.

## Contingency — Fly compute offload (not in this batch)

If production finalize still hits **546** after this deploy, do **not** loop micro-optimizations on Edge alone. Propose a separate approved batch:

| Layer | Responsibility |
| --- | --- |
| Edge `sync-screener-data` | Chunks, leases, preserve check, **`publish_screener_sync_staged_generation_v1`**, `complete_publish`, cron resume |
| Fly `scanner-stream-worker` | Finalize **compute** only: load job tickers + merged artifacts via **new bridge read actions**, run shared `_shared/screeners/*` finalize path, persist **`finalize_prepared`** (rows + evidence) via bridge write |
| Lovable bridge Edge | New allowlisted actions; service role stays server-side |

**Likely first offload candidates (highest sync CPU on 13k):** full-snapshot **`selectGainersLosersRanked`**, **`finalizeMainUniverseSelections`** on large qualifier lists, **`attachRvol20dToRows`** + evidence assembly if publish serialization remains hot.

**Out of scope without approval:** Fly machine/scaling changes, moving Postgres/Supabase, worker holding service role, replacing atomic publish RPC, or dropping any of six tabs / volume-first semantics.

No Fly or bridge work is started until 190.14 production evidence is collected and owner approves a follow-on batch.
