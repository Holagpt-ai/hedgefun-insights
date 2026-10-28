# P0 — Edge screener CPU publication failure

**Symptom (Lovable Cloud, 2026-10-28):** `sync-screener-data` logged **CPU Time exceeded** at 16:45 and 16:50 UTC (~13,262 symbols evaluated); last successful publish **16:15:04 UTC** (108 rows). Cron job 25 still invoked the function — failure mode is **Edge CPU budget**, not cron or provider HTTP alone.

**Deployed D1 fingerprint (Lovable):** `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`.

## Root cause

D1 observation-session volume and tab evidence perform **many full-universe passes** per symbol (selection, NHL, gappers/NHL evidence). At ~13k symbols this exceeds Supabase Edge **documented ~2s actual CPU** before the atomic replace RPC.

## Fix (PR #194)

- **`SessionVolumeCache`** with **binding** (`nowMs`, observation flags) — per-sync WeakMap memo; ignores cache on context mismatch.
- **Incremental radar diagnostics** (no 13k diagnostic array).
- **`selectMainUniverseTabs`** — one qualification pass for four main tabs.
- **Single primary-universe evidence scan** for generic tab counts; gappers volume fold-in.
- **NHL selection** — one `classifyNewHighLow` per symbol (no duplicate classify on selected rows).

Qualification thresholds, D1 semantics, six tabs, and RPC contracts unchanged.

## Representative benchmark (local wall-clock — NOT Edge CPU)

Instrument: `sync-screener-cpu-benchmark.ts` / `sync-screener-universe-cpu_test.ts`.

| Session | Optimized total (ms) | Legacy multi-pass (ms) | Dominant optimized stages |
| --- | ---: | ---: | --- |
| Regular | ~3,233 | ~17,639 | tab_selection ~1,576; evidence ~1,593 |
| Pre-market | ~4,491 | ~20,367 | tab_selection ~2,781; evidence ~1,679 |
| After-hours | ~3,003 | ~15,864 | tab_selection ~1,476; evidence ~1,491 |

Includes: 13,262 universe, six-tab path (NHL baselines ~510 symbols), gainers/losers on 800-symbol provider slice, row mapping, JSON RPC payload construction, premarket/regular/after-hours observation timestamps.

**Important:** Deno `performance.now()` measures **local elapsed time**, not Supabase billed CPU. Optimized totals **~3–4.5s** locally do **not** prove compliance with Edge’s **~2s CPU limit**. Production validation requires Lovable deploy + post-cron log review.

## Correctness

`session-volume-cache-parity_test.ts` — cached vs uncached parity for selections, rows, evidence; contradictory/mixed timestamps; cache binding mismatch.

## Release recommendation

**BLOCKED (production-ready claim)** until:

1. Lovable redeploy of PR #194 head and at least one **successful full-universe publish** (non-zero `rows_inserted` when qualified), **or**
2. Measured Edge CPU &lt; limit in Lovable metrics, **or**
3. Approved **architectural split** (e.g. chunked worker / reduced synchronous universe work) if CPU remains over budget.

The PR is still recommended as a **material CPU reduction** (~5× vs legacy multi-pass in local benchmark) but **cannot alone guarantee** Edge compliance.

## Verification

```sh
deno test --frozen --no-check supabase/functions/_shared/screeners/sync-screener-universe-cpu_test.ts
deno test --frozen --no-check supabase/functions/_shared/screeners/session-volume-cache-parity_test.ts
deno test --frozen supabase/functions/_shared/screeners/session-volume_test.ts
deno test --frozen --no-check supabase/functions/sync-screener-data/handler_test.ts
npm run typecheck && npm run build
```
