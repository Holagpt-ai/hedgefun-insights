## Summary

Implements **Option B** from `docs/release/iss034-option-b-degraded-tab-publication-v1.md`.

**Stacked on PR #260** @ `9970ae435ad1451d764b5e668e45bf99da3dfdaa` — merge **#260** first.

**Parent replay gate (PR #260):** **SATISFIED** — job `4ed4a4c7-d8c4-4582-bd89-cc949d6e291d`, **13,240** tickers, Deno replay exit **0**, counters **1302/1298/1/1/2**, ASBPW/ASPCR `missing_prior_close`. Export not in git. **ISS-034 OPEN** until merge, deploy, and production acceptance.

- Feature flag `SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH` — default **off** (only exact `true` enables).
- Gappers-only `gap_input_coverage_incomplete` publish when G/L + NHL **evaluated** on candidate; row omission shares same gate; Radar skip for incomplete coverage.
- Frontend truth-state + carryover-watch regressions.

## Test plan

- [x] R1–R7 `iss034-option-b-implementation_test.ts`
- [x] RG-* `iss034-option-b-release-gate_test.ts`
- [x] `generation-preserve_test.ts` (Option B paths)
- [x] Vitest `screener-truth-state`, `carryover-watch`
- [x] Parent replay tests on stack (`iss034-job-gappers-replay_test.ts` via #260 base)
- [x] `npm run typecheck`
- [x] Critical screener CI (after rebase push)

## Activation (owner — NOT done in this PR)

1. Merge **#260**, then this PR.
2. Lovable: set `SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH=true` **only** when approved.
3. Deploy `sync-screener-data` + Vercel frontend.
4. **ISS-024 Layer C** remains separate / blocked until owner pre-flight.

**No merge, deploy, SQL, or flag activation in this delivery.**