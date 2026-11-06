# Batch 191.1 — Gappers split-scale coverage evidence (ISS-024 / ISS-034)

**Scope:** Edge `sync-screener-data` tab-evaluation evidence only. **No SQL migration**, Fly, Vercel, cron, secrets, or provider configuration changes.

## Confirmed root cause (2026-11-06)

During regular hours, some scanner generations completed **7/7** staged chunks but were **not published** because `shouldPreservePriorScreenerGeneration` saw **Gappers** degrade from **`evaluated` → `prerequisite_unavailable`** (`reason: gap_input_coverage_incomplete`).

The Gappers fail-closed accounting treated symbols whose **gap %** was intentionally **null** only because **`regularClose` vs session reference** triggered the existing **`impliesSplitScale`** guard (sub-penny / CA scale mismatch) as **unresolved gap inputs**. Examples reproduced against production-shaped snapshots: **SLND.WS**, **NMZr**, **CINGW** class instruments.

That inflated **`unresolved_gap_input_count`**, broke **complete accounting**, and blocked **`evaluated`** status — even when the only “missing” gap inputs were **split-scale suppressed**, not missing prior close.

## Fix (git)

1. **`gapSuppressedOnlyBySplitScaleGuard`** in `supabase/functions/_shared/screeners/selection.ts`  
   Returns true **only** when gap is suppressed **solely** by the **`impliesSplitScale(regular, reference)`** path. Missing `prevDay.c`, invalid opens, etc. stay **false**.

2. **New counter `split_scale_suppressed_count`** on **`GappersTabEvidence`** and **`GappersEvidenceAccum`**  
   Full volume-active accounting is now:

   `gap_calculable + no_prior_session + split_scale_suppressed + unresolved = volume_positive`

3. **`deserializeMergedArtifacts`** normalizes legacy staged jobs: missing `split_scale_suppressed_count` → **0**.

4. **Client** `src/lib/screeners/tab-evaluation-evidence.ts` parses optional `split_scale_suppressed_count`; **`gappersEvidenceSupportsZeroMatch`** includes it in the sum.

## Deployment

- **Requires** Lovable Cloud deploy of **`sync-screener-data`** (Edge) after merge to `main`.  
- No Postgres migration. Staging JSONB continues to round-trip; older rows gain `split_scale_suppressed_count: 0` on deserialize.

## Acceptance

- **ISS-024** / **ISS-034** remain **OPEN** until Batch **191** RTH/AH verification; this batch fixes a **specific evidence-classification defect**, not full tab-freshness sign-off.
