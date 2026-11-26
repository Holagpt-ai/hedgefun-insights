## Summary

- **ISS-024 Layer D:** Honest `prior_surveillance_session_snapshot` UI copy when `viewForActiveTab` withholds rows for `previous_during_live` (extends batch 219.3B session-gate semantics beyond generic "Screener unavailable").
- **ISS-024 Layer C:** Add bounded activation runbook `batch191-layer-c-production-activation-v1.md` to git (SQL/Edge still **BLOCKED** until owner Lovable pre-flight).
- **ISS-044:** Read-only weekday **20:00 ET** acceptance runbook; **Fly v50 preserved** (no worker changes).

## Preserved (no changes)

ISS-034/#260-261, ISS-049/v50, ISS-041/#255, ISS-043, ISS-036, ISS-045, Option B OFF.

## Test plan

- [x] `vitest` `screener-truth-state` (31), `screener-session` (4)
- [x] `npm run typecheck`
- [ ] Vercel deploy + authenticated Screeners six-tab walkthrough (Layer D acceptance)
- [ ] Natural ISS-044 20:00 ET observation (owner)
- [ ] Layer C Lovable pre-flight then owner-authorized SQL/Edge