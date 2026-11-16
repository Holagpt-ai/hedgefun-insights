# ISS-034 — November 16, 2026 all-day scanner publication stall

**Evidence time:** ~5:06 PM ET  
**Last successful publish:** 9:25 AM ET, **100** rows  
**Pattern:** **87** aborts / 12h, **7/7** chunks, `abort_reason=prior_generation_retained`, last stage `finalize_stage:build_evidence`, Gappers `prerequisite_unavailable`, G/L + NHL `evaluated`.

**Not** the November 13 opening-bell transient (`day.o` at 09:30). This is **persistent** incomplete Gappers accounting across RTH.

## Mechanism (source)

1. `buildTabEvaluationEvidenceFromChunkAccums` → Gappers `gap_input_coverage_incomplete` when `unresolved_gap_input_count > 0` (fail-closed).
2. `shouldPreservePriorScreenerGeneration` sees prior feed (9:25 AM) Gappers **`evaluated`** vs candidate **`prerequisite_unavailable`** → **`prior_generation_retained`** (same surveillance date).
3. No publish RPC; feed frozen at 9:25 AM.

## Production-shaped accum (example job `4ed4a4c7-d8c4-4582-bd89-cc949d6e291d`)

| Counter | Value |
| --- | --- |
| `volume_positive_count` | 1302 |
| `gap_calculable_count` | 1298 |
| `no_prior_session_count` | 1 |
| `split_scale_suppressed_count` | 1 |
| `unresolved_gap_input_count` | **2** |

Accounting identity: `calculable + no_prior + split_scale + unresolved = volume_positive`.

## Owner read-only blocker (PR #260 correction, 5:48 PM ET)

On the **stored production snapshot** (13,240 symbols):

- **615** symbols without positive `day.o`.
- **Zero** missing-open symbols with positive `day.c`.
- **Zero** symbols matching `gapSuppressedByCloseVersusPriorWithoutOpen()` (positive `day.c` + `prevDay.c`, missing `day.o`).

Therefore the first PR #260 classifier **does not** reduce `unresolved_gap_input_count` for this job (`2 → 2`).

### Replay (identify symbols + prerequisites)

1. Lovable read-only export: `observation`, `all_tickers`, optional `merged_artifacts` for job `4ed4a4c7-…`.
2. `deno run --allow-read scripts/ops/iss034-gappers-replay.deno.ts job-export.json`
3. Output includes `baseline.unresolved[]` (symbol, `rejectReason`, prerequisite flags) and `unresolved_delta` vs the replay-only close-vs-prior helper.

**Expected rejection class for owner-shaped tails:** `missing_gap_reference` — volume-active, **no** positive `day.o`, **no** positive `day.c`, positive `prevDay.c` (legitimate RTH gap contract: gap requires `day.o` vs `prevDay.c`; no synthesis).

## PR #260 corrected scope (same PR, not merged)

| Item | Action |
| --- | --- |
| `gapSuppressedByCloseVersusPriorWithoutOpen` | **Removed** from publish accounting; kept for replay comparison only |
| `gappers-gap-input-accounting.ts` | Shared classify + `replayGappersGapInputAccounting` / `compareGappersGapInputAccounting` |
| `unresolved_gap_symbols` | Bounded on chunk accumulate, chunk merge, and deserialize |
| `abort_evidence.candidate_gappers` | Gappers counts + symbols on `prior_generation_retained` (not only live feed) |

## Publication policy (owner approval required if stall must clear without provider fix)

Fail-closed default **unchanged**: any volume-active symbol without calculable gap inputs blocks Gappers `evaluated` and can trigger preservation.

| Option | Tradeoff |
| --- | --- |
| **A — Wait for provider** | No rule change; stall ends when `day.o` (or extended reference) arrives for the two symbols |
| **B — Publish with degraded Gappers** | Requires explicit change to `shouldPreservePriorScreenerGeneration` / tab status policy — **not in this PR** |
| **C — Exclude named instrument classes** | Requires verified symbol policy + exclusion evidence — **not in this PR** |

## Deployment

- **`sync-screener-data`** Edge only (Lovable), **after** owner approves PR #260 correction. **No** SQL/Fly/cron.
- **ISS-024 Layer C** remains **BLOCKED** separately.

## Verification after deploy

```sql
SELECT created_at, status, abort_reason,
       abort_evidence->'candidate_gappers' AS gappers,
       tab_evaluation_evidence->'gappers' AS tab_gappers
FROM public.screener_sync_generation_jobs
WHERE (created_at AT TIME ZONE 'America/New_York')::date = '2026-11-16'
ORDER BY created_at DESC
LIMIT 10;
```

**Pass:** next `published` row when provider inputs resolve **or** after an approved policy change; Gappers `status=evaluated` or `unresolved_gap_input_count=0`; `candidate_gappers.unresolved_gap_symbols` empty or documented.