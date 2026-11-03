# Batch 192 — AM Inbox reliability & AI Brief evidence integrity

**Issues:** ISS-025 (partial — UI metadata + brief timing), AI Pre-Market Brief evidence cutoff integrity  
**Scope:** Frontend + shared Edge evidence selection (no migration)

## Changes

- Strip internal `__RVOL_*` capture labels from continuation card copy; RVOL metric kind/baseline still parsed from persisted labels and shown via formatted RVOL lines.
- AM Intelligence Brief V2: exclude market headlines and direct catalysts whose `published_at` is after `source_checked_at`. Headlines and **direct catalysts** with missing or unparseable `published_at` fail closed (excluded from verified evidence). **Before-open earnings** still use calendar `event_date` / `time_of_day` via `selectBeforeOpenEarningsEvidence` — future scheduled earnings behavior unchanged.
- **Cached briefs:** Existing `daily_briefs` rows continue to serve through `return_cached` / `cachedBody` when material evidence is unchanged or optional fetches fail. Deploy does **not** truncate or reset brief history; only new generations after Edge deploy apply the stricter cutoff rules.
- AM Inbox: initial late-session loading uses `isPending` without stale cross-date data to avoid indefinite spinner edge cases.

## Verification

- `npm run typecheck`
- Focused Vitest: late-session persistence, `LateSessionHandoffsList`, `AMInbox.late-session-reliability`, `useAmInboxLateSessionHandoffs`
- Deno: `supabase/functions/_shared/briefs/am-evidence_test.ts`

## Production activation

- **Vercel:** frontend deploy for Workstreams A/B.
- **Lovable Cloud Edge:** redeploy `generate-daily-brief` for Workstream C cutoff rules.
