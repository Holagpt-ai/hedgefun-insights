## Summary
- Forward migration `20261125203000` adds `validate_screener_feed_reconcile_evidence_v1` and replaces `reconcile_screener_sync_staged_publish_v1` so stranded-job recovery accepts either full six-tab `evaluated` evidence **or** canonical Option B degraded Gappers (`gap_input_coverage_incomplete`, companions evaluated, zero Gappers result rows).
- Activation bundle documents ordered execution with existing `20261116153000` in one transactional window (preserves v530 Edge; no Edge deploy in this PR).
- Disposable Postgres regression suite covers normal/Option B recovery, invalid evidence, row counts, evidence mismatch, idempotency, and lease gates.

## SQL activation (owner only — not executed here)
1. `supabase/migrations/20261116153000_screener_sync_generation_tab_evidence_v1.sql`
2. `supabase/migrations/20261125203000_screener_option_b_reconcile_evidence_v1.sql`

Runbook: `docs/release/batch191-layer-c-option-b-activation-bundle-v1.md`

## Test plan
- [x] `npm run typecheck`
- [ ] Critical screener CI (includes new postgres tests)
- [ ] Owner: quiescent-window SQL apply via Lovable integration