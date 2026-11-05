# Batch 190.15 — Slim staging RPC payloads

**Priority:** P0 (ISS-034)  
**Merged:** PR **#217** → GitHub `main` **`3c810c4b`** (Batch 190.14 base **`1b7d86d6`**)  
**Migration:** `20261104230000_screener_sync_slim_control_json_v1.sql` — **reported applied** Lovable Cloud **2026-11-04** (after Edge deploy). **Supabase-native ledger only** — no `drizzle/migrations/` mirror; rollback after apply requires a separate approved SQL migration, not Edge-only revert alone.

## Production evidence

Per generation, staging rows carry about **2.35 MB** `all_tickers`, **290 KB** NHL snapshot, and **399 KB** merged artifacts. RPCs that returned `to_jsonb(job)` sent those arrays back to Edge. Finalize still exits with HTTP **546** when billed CPU is exceeded.

## RPC map

| RPC | Caller needs | Response after 190.15 |
| --- | --- | --- |
| `claim_screener_sync_lease_v1` | Next chunk slice and finalize G/L rank, lifecycle capture, frozen NHL snapshot | **Full job** (unchanged) |
| `advance_screener_sync_chunk_v1` | `id`, `next_chunk_index`, `total_chunks`, `state_version`, `status` | **`control`** |
| `publish_screener_sync_staged_generation_v1` | `rows_inserted`, `state_version`, idempotent replay | **`control`** |
| `record_screener_sync_publish_rpc_v1` | `state_version`, `publish_rows_inserted` | **`control`** |
| `complete_screener_sync_publish_v1` | ok / reason | unchanged (already no job) |
| `reconcile_screener_sync_staged_publish_v1` | job id | unchanged |
| Post-publish candidate scan | status, versions, publish stamps, lease expiry | column list **without** `all_tickers`, gainers, losers, merged artifacts, NHL snapshot |

Failure reasons, CAS predicates, lease checks, atomic `replace_screener_results_generation_v1`, and Batch **190.12** / **190.13** recovery are unchanged. Edge accepts **`control` or legacy `job`** so an Edge deploy before the migration still works.

`jobFromControl` is for CAS fields only. It does not carry `all_tickers`. Finalize still loads the universe from **claim**.

## Baseline drift

`validateJobBaselineDrift` reads `screener_52w_baseline_state` (`current_generation_id`, `status`) only. It does not page `screener_52w_baselines`. NHL quotes stay on the frozen snapshot already stored on the job.

## Gainers/Losers chunks

Per-chunk top-20 is **not** parity-safe when the same symbol appears twice and the later copy is weaker: the full-universe map keeps the later row, while a chunk top-20 can keep the earlier strong row. Finalize still calls `selectGainersLosersFromUniverse` on the provider list or `all_tickers`. No new chunk table.

## Local payload measurement

`batch190-15-slim-payload_test.ts` logs `[batch190-15-payload]`. Measured local JSON: full job response **2,424,349** bytes; control response **335** bytes. Those are JSON byte sizes, not Supabase billed CPU.

## Activation (owner) — reported complete 2026-11-04

1. ~~Merge this PR.~~ **Done** — PR **#217**.
2. **Lovable Cloud** Edge **`sync-screener-data`** deployed **2026-11-04** (dual-read).
3. Migration **`20261104230000`** applied through Lovable Cloud. Batch **190.12** / **190.13** not reapplied.
4. **Reported verification:** first natural post-migration generation **85** rows, six tabs, **7/7** chunks; full RPC ~**8.60 MB** vs **`control`** **407 bytes**. **ISS-034 stays OPEN** until **Batch 191** repeated RTH/AH acceptance — do not treat one run as durable CPU headroom.

## Rollback

Before the migration is applied, redeploy `sync-screener-data` from git **`1b7d86d6`**. That identifies source. It does not restore a specific live Edge revision id.

After the migration is applied, do not roll Edge back to a build that requires `job` on publish/advance. Reversing the slim functions requires a separate approved SQL change. No schema columns are dropped.
