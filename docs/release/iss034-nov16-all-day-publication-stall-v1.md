# ISS-034 — November 16, 2026 all-day scanner publication stall

**Evidence time:** ~5:06 PM ET  
**Last successful publish:** 9:25 AM ET, **100** rows  
**Pattern:** **87** aborts / 12h, **7/7** chunks, `abort_reason=prior_generation_retained`, last stage `finalize_stage:build_evidence`, Gappers `prerequisite_unavailable`, G/L + NHL `evaluated`.

**Not** the November 13 opening-bell transient (`day.o` at 09:30). This is **persistent** incomplete Gappers accounting across RTH.

## Mechanism (source)

1. `buildTabEvaluationEvidenceFromChunkAccums` → Gappers `gap_input_coverage_incomplete` when `unresolved_gap_input_count > 0` (fail-closed).
2. `shouldPreservePriorScreenerGeneration` sees prior feed (9:25 AM) Gappers **`evaluated`** vs candidate **`prerequisite_unavailable`** → **`prior_generation_retained`** (same surveillance date; not `previous_during_live`).
3. No publish RPC; feed frozen at 9:25 AM.

## Production-shaped accum (example job)

| Counter | Value |
| --- | --- |
| `volume_positive_count` | 1302 |
| `gap_calculable_count` | 1298 |
| `no_prior_session_count` | 1 |
| `split_scale_suppressed_count` | 1 |
| `unresolved_gap_input_count` | **2** |

Accounting identity: `calculable + no_prior + split_scale + unresolved = volume_positive`.

## Classification fix (git)

Extend split-scale evidence (Batch **191.1** follow-on): **`gapSuppressedByCloseVersusPriorWithoutOpen`** — regular session, missing `day.o`, `impliesSplitScale(day.c, prevDay.c)` → **`split_scale_suppressed_count`**, not unresolved. Does **not** synthesize opens or weaken volume-first ranking.

Post-fix: if the **only** tail were misclassified warrant/stubs, Gappers returns **`evaluated`** and preserve stops blocking.

If **legitimate** unresolved symbols remain (e.g. missing `prevDay.c`), stall continues until provider inputs resolve — **policy unchanged**.

New diagnostics: **`unresolved_gap_symbols`** sample on Gappers evidence (capped).

## Deployment

- **`sync-screener-data`** Edge only (Lovable). **No** SQL/Fly/cron.
- **ISS-024 Layer C** remains **BLOCKED** separately.

## Verification after deploy

```sql
SELECT created_at, status, abort_reason,
       tab_evaluation_evidence->'gappers' AS gappers
FROM public.screener_sync_generation_jobs
WHERE (created_at AT TIME ZONE 'America/New_York')::date = '2026-11-16'
ORDER BY created_at DESC
LIMIT 10;
```

**Pass:** next `published` row; Gappers `status=evaluated` or `unresolved_gap_input_count=0`; `unresolved_gap_symbols` empty or documented.