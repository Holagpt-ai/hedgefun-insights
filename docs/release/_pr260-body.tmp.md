## Summary

- **Incident:** Nov 16 all-day scanner stall — last publish **9:25 AM ET**; **87×** `prior_generation_retained` with Gappers `gap_input_coverage_incomplete` (`unresolved_gap_input_count=2` on job `4ed4a4c7-d8c4-4582-bd89-cc949d6e291d`).
- **Cause:** Fail-closed Gappers accounting + `shouldPreservePriorScreenerGeneration` vs 9:25 evaluated feed (not Nov 13 opening-bell transient).
- **Confirmed unresolved (production):** **ASBPW**, **ASPCR** — **positive `day.o`**, **zero `prevDay.c`**, historical baseline/exclusion present → reject reason **`missing_prior_close`** (not missing opening prices). Owner read-only replay: **zero** symbols match removed `gapSuppressedByCloseVersusPriorWithoutOpen()` on full **13,240**-symbol snapshot.

## Scope

- Honest stall diagnostics: `gappers-gap-input-accounting.ts`, bounded `unresolved_gap_symbols`, `abort_evidence.candidate_gappers`, subset replay tests + `scripts/ops/iss034-gappers-replay.deno.ts`.
- **Removed** unproven close-vs-prior-without-open helper from **publish** accounting (replay comparison only).
- Edge `sync-screener-data` shared screener logic only. **No** SQL/Fly/cron. **Option B** is **#261**, not this PR.

## Test plan

- [x] `iss034-nov16-gappers-stall_test.ts`
- [x] `iss034-nov16-asbpw-aspcr-production-replay_test.ts` — ASBPW/ASPCR `missing_prior_close`
- [x] `iss034-gappers-gap-input-replay_test.ts`
- [x] `npm run typecheck`
- [x] Critical screener CI (Deno regressions workflow)

## Release gate (unresolved — blocks production trust)

- Mandatory **13,240-ticker** Lovable export replay for job `4ed4a4c7-d8c4-4582-bd89-cc949d6e291d` via `scripts/ops/iss034-gappers-replay.deno.ts`.
- The **1,302**-symbol-shaped CI fixture validates counters only on a **subset** — **not** full-universe validation.

## Residual risk

Stall persists until provider inputs fix for ASBPW/ASPCR **or** owner-approved Option B (**#261**, flag off by default). Do not weaken all-universe Gappers coverage in this PR.