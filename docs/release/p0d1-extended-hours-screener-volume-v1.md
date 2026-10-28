# P0 D1 — Extended-Hours Screener Volume Integrity V1

**Base:** `main` **`68092518`**  
**Production evidence:** Lovable read-only Oct 28 ~9:17 AM ET — `day.v=0`, positive `min.av` on NVDA/TSLA/SPY/AAPL; all symbols failed minimum-volume; gappers `no_volume_active_universe`.

## Root cause

Edge screeners used `dayVolume()` (`day.v` only) for qualification, dedupe, ratios, persisted rows, and gappers volume-active counts. Polygon sends `day.v=0` during premarket while cumulative session volume lives on `min.av`. Extended sync therefore treated every symbol as zero-volume.

**Source files:** `selection.ts` (`dayVolume`, `selectVolumeFirst`, ratio helpers), `rows.ts`, `evaluation-evidence.ts`, `new-highs-lows.ts`, `sync-screener-data/handler.ts` (volume tabs not passed extended volume context).

## Fix

New contract in `session-volume.ts`:

| Session | Volume source |
| --- | --- |
| Regular | Positive `day.v` only (`0` = unavailable) |
| Premarket | Positive `min.av` only (never `min.v` substitute) |
| After-hours | `min.av - day.v` when both positive and `min.av > day.v`; else unavailable |

Propagated via `sessionQualificationVolume()` through selection, rows, NHL, evidence, handler extended tab opts, and normalized snapshot volume.

**DTR diagnostics:** During premarket, missing regular `day.c` no longer inflates `missing_invalid_snapshot`; eligibility unchanged.

## Verification

```sh
deno test --allow-read supabase/functions/_shared/screeners/session-volume_test.ts
deno test --allow-read supabase/functions/_shared/screeners/selection_test.ts
deno test --allow-read supabase/functions/_shared/screeners/gappers-premarket_test.ts
deno test --allow-read supabase/functions/_shared/screeners/evaluation-evidence_test.ts
deno test --allow-read supabase/functions/_shared/screeners/rows_test.ts
npm run typecheck
npm run build
```

## Deployment gate

After merge, deploy **`sync-screener-data`** via **Lovable Cloud** only. Record rollback SHA. Live verify premarket tab evidence (`volume_positive_count` > 0 when `min.av` present) — production Edge revision id **UNKNOWN** until deploy.
