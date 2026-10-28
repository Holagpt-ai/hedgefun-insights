# P0 — Edge screener CPU publication failure

**Symptom (Lovable Cloud, 2026-10-28):** `sync-screener-data` logged **CPU Time exceeded** at 16:45 and 16:50 UTC (~13,262 symbols evaluated); last successful publish **16:15:04 UTC** (108 rows). Cron job 25 still invoked the function — failure is **Edge CPU budget**, not cron or provider HTTP alone.

**Deployed D1 fingerprint (Lovable):** `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`.

## Root cause

D1 **observation-session volume** (`resolveVerifiedObservationMs`, `sessionQualificationVolume`, extended gap/move semantics) runs **many times per symbol** across:

- Six tab selection passes on the full snapshot
- Tab evaluation evidence (gappers, NHL, generic tabs — multiple full-universe loops)
- NHL selection and row mapping

That repeated per-ticker work on ~13k symbols exceeded Supabase Edge **CPU time** before the atomic replace RPC.

## Fix (git)

1. **`SessionVolumeCache`** — WeakMap memo for observation ms, qualification volume, and extended-quote semantics for the duration of one sync run.
2. **Incremental radar diagnostics** — summary counters instead of a 13k-element diagnostic array.
3. **Single primary-universe scan** for day-trade / volume-spike / unusual qualified counts in `buildTabEvaluationEvidence`.
4. **Gappers evidence** — drop redundant pre-pass `countVolumeActive`.

Qualification thresholds, D1 semantics, six tabs, and RPC contracts unchanged.

## Verification

```sh
deno test --frozen supabase/functions/_shared/screeners/sync-screener-universe-cpu_test.ts
deno test --frozen supabase/functions/_shared/screeners/session-volume_test.ts
deno test --frozen supabase/functions/sync-screener-data/handler_test.ts --no-check
npm run typecheck && npm run build
```

## Deploy

Lovable Cloud: redeploy **`sync-screener-data`** only after merge; confirm next cron publish and `rows_inserted` > 0 when universe qualifies.
