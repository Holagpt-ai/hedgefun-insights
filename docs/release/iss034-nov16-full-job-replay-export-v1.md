# ISS-034 — Nov 16 full-job Gappers replay export (Lovable read-only)

**Target job:** `4ed4a4c7-d8c4-4582-bd89-cc949d6e291d`  
**Table:** `public.screener_sync_generation_jobs` (staged sync ledger)  
**Purpose:** Reproduce production Gappers gap-input counters on the original **13,240**-ticker universe with the job’s frozen NHL baseline — not the current clock or live baseline.

## Required export fields

| Field | Requirement |
| --- | --- |
| `id` | Job UUID (must match target for production sign-off) |
| `sync_run_id` | Candidate sync run id |
| `observation` | JSON with **`nowMs`**, **`extendedSession`**, **`observationSessionFields`** (exact booleans from job row) |
| `all_tickers` | Full universe array (`PolygonTicker[]` as stored at finalize) |
| `merged_artifacts` | Must include `gappersAccum` counters + optional `unresolvedGapSymbols` |
| `nhl_baseline_snapshot` | Frozen snapshot: `quoteEntries`, `policyExclusions`, `baselineGenerationId`, `status`, `frozenAtMs` |

**Do not** omit `nhl_baseline_snapshot`. Replay **rejects** exports without a parseable frozen baseline.

## Suggested read-only SQL (Lovable SQL editor / service role)

```sql
SELECT
  id,
  sync_run_id,
  observation,
  all_tickers,
  merged_artifacts,
  nhl_baseline_snapshot
FROM public.screener_sync_generation_jobs
WHERE id = '4ed4a4c7-d8c4-4582-bd89-cc949d6e291d';
```

Export query result as JSON (single row). For large payloads, use Lovable’s row download or split `all_tickers` only if the platform caps size — full **13,240** symbols are required for release validation.

## Replay command

```bash
deno run --allow-read scripts/ops/iss034-gappers-replay.deno.ts path/to/job-export.json
```

Exit **0** when stored `gappersAccum` matches replay; **1** on missing/invalid inputs; **2** on counter mismatch.

## Expected stored counters (Nov 16 evidence — verify on full export)

| Counter | Expected |
| --- | ---: |
| `volume_positive_count` | 1,302 |
| `gap_calculable_count` | 1,298 |
| `no_prior_session_count` | 1 |
| `split_scale_suppressed_count` | 1 |
| `unresolved_gap_input_count` | 2 |

Unresolved symbols (owner-confirmed): **ASBPW**, **ASPCR** — `missing_prior_close` (positive `day.o`, zero `prevDay.c`), not missing open.

## Release gate

| Validation | Status |
| --- | --- |
| 1,302-symbol-shaped CI fixture | Subset counter sanity only — **not** full-universe proof |
| Full job export + replay CLI | **Mandatory** before production trust / merge sign-off |

**No** SQL apply, Edge deploy, or secrets from Cursor unless owner explicitly authorizes.