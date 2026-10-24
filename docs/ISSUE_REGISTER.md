# Issue register

Keep this list short. Move an item to `docs/CHANGELOG.md` when it is fixed. Labels: **confirmed** (checked this session against `main` or a command), **reported** (older doc, not rechecked), **deferred** (intentionally not in progress).

Baseline: `origin/main` `63957b319be959888af59410bd36c58cce45fb6d`, 2026-10-24.

## Confirmed

| ID | Item | Evidence |
| --- | --- | --- |
| ISS-001 | AI Analyst Catalyst Evidence Depth V2, chat catalyst delivery, and the follow-up source-recovery change are not on `main` | Commits `68c88114`, `2f22387b`, and `ed75aa71` on `origin/cursor/chat-single-pass-v1`. `analyst-intelligence-delivery.ts` is absent from `origin/main`. Parallel branch `origin/cursor/catalyst-evidence-depth-v2` at `c3bb034a`. |
| ISS-002 | Registered navigation has no broken route | `npm run integrity` on 2026-10-24: 0 errors, 125 routes. Coverage is the nav file list in `scripts/integrity/lib/navigation.mjs`, not every link in the app. |

## Reported

| ID | Item | Why it is not confirmed |
| --- | --- | --- |
| ISS-003 | Production git SHA for Vercel, Edge Functions, and Fly images is unknown | Asset manifest has hashes only. Live js was `index-CpDXxxyv.js`. No deploy API was queried. |
| ISS-004 | Gate I.3 docs disagree about whether production is already fully activated | Checklist says the migration and `sync-sec-edgar-filings` are live. The Gate I.3 readiness doc still lists activation steps and says Cursor did not enable writes or cron. Live database was not queried. |
| ISS-005 | Batch 34 still records migration apply and Edge version status as unknown | `docs/release/batch34-production-release-manifest.md`. Not refreshed against production. |
| ISS-006 | Catalyst source activation was planned and not executed in Batch 34 | `docs/catalyst-intelligence/batch34-catalyst-activation-sequence.md`. |
| ISS-007 | AI Analyst generation and streaming failures were explicitly deferred in Batch 34 | Same manifest, section on remaining work. Not retested here. |

## Deferred

| ID | Item | Notes |
| --- | --- | --- |
| ISS-008 | Real-time feed upgrades | Out of scope until a later batch. |
| ISS-009 | AI Trader | Dashboard route exists. `AI_TRADER_CURRENT_OPERATING_MODE` is `OFF`. Shadow worker must not be expanded in product batches. |
| ISS-010 | Broker integration | No broker batch is approved. |
| ISS-011 | Billing go-live | `ProPage` and `AccountPage` say payment processing is being set up. Stripe functions exist. Live Stripe state was not checked. |
| ISS-012 | SEC cron and write-gate changes | Draft SQL is `docs/sec-edgar/unapplied-cron.sql`. Do not apply from an app PR. |
| ISS-013 | Community | `/dashboard/community` is a waitlist page. |
| ISS-014 | Sitemap omissions | Integrity info, not a failure: 27 public or redirect routes are absent from the main sitemap, including `/etfs`, tool calculators, `/advertise`, `/download`, and `/support`. `/etfs/screener` is the canonical screener URL. |

## Not a defect

- MCP server id `hedgefun-mcp` with public title `Stocksist Market Data`. Leave the generated bundle on the PR #162 contents.
- `cursor/chat-single-pass-v1` diverges from `main`. That is expected for the archived Lovable branch. Do not merge it to “catch up”.
