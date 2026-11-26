## Summary

**Option B** — `docs/release/iss034-option-b-degraded-tab-publication-v1.md`.

**Base:** `main` @ **`b04789c00ad954716a9a16403c66dd21b9724b4c`** (**PR #260** merged). Full-universe replay gate **SATISFIED** on **main** (not re-run in this PR).

- `SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH` — default **off** (exact `true` only).
- Gappers-only `gap_input_coverage_incomplete` publish when G/L + NHL **evaluated** on candidate; row omission + Radar guards.
- **ISS-034 OPEN** until merge, deploy, production acceptance.

## Test plan

- [x] Option B R1–R7 + RG-* Deno tests
- [x] Vitest truth-state / carryover-watch
- [x] `npm run typecheck`
- [x] Critical screener CI after rebase onto `main`

## Activation (owner — NOT in this PR)

1. Merge **#261**.
2. Lovable: `SCREENER_ALLOW_DEGRADED_GAPPERS_PUBLISH=true` only when approved.
3. Deploy `sync-screener-data` + Vercel.

**No merge/deploy/SQL/secrets/flag activation in this delivery.**