# Batch 190.10 — Scanner publication integrity + HTTP 409 root-cause preservation

**Issue:** ISS-034 (P0 OPEN)  
**Branch:** `cursor/batch190-10-scanner-publish-integrity`  
**Scope:** Git-only — no production Edge deploy, migrations, or scanner invocation.

## Root causes

1. **Day Trade Radar volume mismatch (Defect A):** Top-20 selection ranks on regular-session `day.v` (`{}` volume context) while row persistence uses observation-session volume (`volumeContextFromMeta`). Extended premarket/after-hours snapshots can qualify on high `day.v` but persist null/nonpositive volume or invalid prior-session ratios, causing `replace_screener_results_generation_v1` to reject the entire six-tab atomic publication.

2. **Terminal error overwrite (Defect B):** `failJob` records a specific `continue_last_error` from publish failure; a later continuation-dispatch path called `recordContinueDispatch` with HTTP 409 and replaced the reason with generic `http_409` when the response body was not parsed.

## Corrections

- **Selection:** After Batch 190.8 observation-session guard, Day Trade Radar in `finalizeMainUniverseSelections` and `selectMainUniverseTabs` requires `hasPersistedPublicationVolumePair` (integer positive volume + positive prior + one-decimal ratio > 0) using observation volume context; volume-first ranking still uses `{}`.

- **Dispatch errors:** `sanitizeContinueDispatchError` + JSON `error` preservation in `parseContinueDispatchError`; `recordContinueDispatch` in memory and Supabase stores does not overwrite `continue_last_error` when job status is already terminal `failed` with a reason.

## Coordination

- Merge order recommended: **PR #202** → **PR #203** → **Batch 190.10**.
- **PR #203 follow-up (optional before merge):** invalid weekend calendar exception rows can still fall back to open weekday schedule; not fixed in 190.10.
- **03:25 UTC 4/7 chunk failure / baseline drift:** separate from atomic-publication volume defect; no change in this batch.

## Production acceptance (Monday 2026-11-02)

After Lovable deploy of `sync-screener-data` from merged `main`:

1. At least one successful six-tab screener publication during extended or regular session without `http_409` from publish RPC validation on volume/ratio tabs.
2. Failed generations retain specific `continue_last_error` (not overwritten by generic `http_409`) when publish fails before continuation succeeds.
3. Day Trade Radar rows show positive integer `volume` and valid ratio fields for extended-session syncs when tab is populated.

## Tests

Targeted Deno suite (batch190-10, sync-finalize-recovery, selection, chunked parity, rows): **61 passed, 0 failed**. `npm run typecheck` passed.
