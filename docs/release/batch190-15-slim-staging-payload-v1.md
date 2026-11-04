# Batch 190.15 — Slim staging RPC payloads

**Priority:** P0 (ISS-034)  
**Base:** GitHub `main` **`1b7d86d6`** (Batch 190.14 merged)  
**Migration:** `20261104230000_screener_sync_slim_control_json_v1.sql` (not applied)

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

## Activation (owner)

1. Merge this PR.
2. **Lovable Cloud** deploy Edge **`sync-screener-data` first** (dual-read). Do not apply the migration before that Edge revision is live.
3. Then apply migration **`20261104230000`** only. Do not reapply Batch **190.12** or **190.13**.
4. Confirm a staged run publishes and claim logs still include the universe, while publish/advance responses contain `control` and not `all_tickers`.

## Rollback

Before the migration is applied, redeploy `sync-screener-data` from git **`1b7d86d6`**. That identifies source. It does not restore a specific live Edge revision id.

After the migration is applied, do not roll Edge back to a build that requires `job` on publish/advance. Reversing the slim functions requires a separate approved SQL change. No schema columns are dropped.
