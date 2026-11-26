## Summary

Implements **Option B** from `docs/release/iss034-option-b-degraded-tab-publication-v1.md`.

**Depends on PR #260** (`cursor/iss034-nov16-gappers-stall`) — merge or review that PR first.

- Feature flag `SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH` — default **off** (only exact `true` enables).
- When **only** Gappers degrades with `gap_input_coverage_incomplete` **and** G/L + NHL are **evaluated** on the candidate, allow atomic publish of other tabs with **zero Gappers rows** and honest `prerequisite_unavailable` evidence.
- Row omission and preserve skip share the same companion-tab gate; incomplete Gappers without verified companions **retain** (fail-closed).
- Frontend: hide stale Gappers rows when evidence unavailable; block Radar restoration for `gap_input_coverage_incomplete`.

## Test plan (R1–R7)

- [x] R1 flag off → retain (`iss034-option-b-implementation_test.ts`, `generation-preserve_test.ts`)
- [x] R2 flag on → publish path; gappers rows omitted; G/L degrade still retains; strict companion eligibility
- [x] R3 ASBPW/ASPCR `missing_prior_close` (positive `day.o`, zero `prevDay.c`) on **#260**
- [x] R4 Gappers recovery → `evaluated` (no row omission)
- [x] R5 `candidate_gappers` abort diagnostics + staged `rowsInserted` vs filtered payload
- [x] R6 Vitest truth-state — no false qualified UI
- [x] R7 Row filter idempotency + non-gapper tab preservation
- [x] Release-gate RG-* (`iss034-option-b-release-gate_test.ts`) — repeat degraded gens, session boundary, omission bypass
- [x] `npm run typecheck`
- [x] Critical screener CI (Deno regressions workflow) — verify on latest push

## Release gate (mandatory before production activation)

1. **13,240-ticker** Lovable export replay for job `4ed4a4c7-d8c4-4582-bd89-cc949d6e291d` — **not** satisfied by 1,302-symbol CI fixture alone.
2. Merge **#260**, then this PR.
3. Lovable: set Edge secret `SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH=true` only when approved.
4. Deploy `sync-screener-data` + Vercel frontend.
5. **ISS-024 Layer C** migration apply remains separate / blocked until owner pre-flight.

**No merge, deploy, SQL, or flag activation in this delivery.**