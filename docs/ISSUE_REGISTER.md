# Issue register

Keep this list short. Move an item to `docs/CHANGELOG.md` when it is fixed. Labels: **confirmed** (checked this session against `main` or a command), **reported** (older doc, not rechecked), **deferred** (intentionally not in progress).

Baseline: parent `origin/main` `03449198`, 2026-10-24. ISS-001 is closed by the catalyst evidence recovery on this change set.

## Confirmed

| ID | Item | Evidence |
| --- | --- | --- |
| ISS-002 | Registered navigation has no broken route | `npm run integrity` on 2026-10-24 after the analyst recovery: 0 errors, 0 warnings, 125 routes. Coverage is the nav file list in `scripts/integrity/lib/navigation.mjs`, not every link in the app. |
| ISS-015 | Production `chat` does not yet run the recovered catalyst delivery | This recovery does not deploy Edge Functions. Live `chat` revision was not queried (ISS-003). Behavior changes only after an approved deploy of `chat` and its `_shared/ai-analyst` imports. |

## Reported

| ID | Item | Why it is not confirmed |
| --- | --- | --- |
| ISS-003 | Production git SHA for Vercel, Edge Functions, and Fly images is unknown | Asset manifest has hashes only. Live js was `index-CpDXxxyv.js`. No deploy API was queried. |
| ISS-005 | Batch 34 still records migration apply and Edge version status as unknown | `docs/release/batch34-production-release-manifest.md`. Not refreshed against production. |
| ISS-006 | Catalyst source activation was planned and not executed in Batch 34 | `docs/catalyst-intelligence/batch34-catalyst-activation-sequence.md`. |
| ISS-007 | AI Analyst generation and streaming failures were explicitly deferred in Batch 34 | Same manifest, section on remaining work. Not retested here. |
| ISS-016 | October 24 Vercel deployment reported 42 npm vulnerabilities: 3 critical, 25 high, 13 moderate, 1 low | Deployment report only. Not re-audited here and not a confirmed production exploit. Do not run `npm audit fix --force`. |
| ISS-017 | Production JavaScript bundle is large, about 3.45 MB | October 24 Vercel report. This session's local production build wrote `index-BjQutdyt.js` at 3,456.14 kB and Vite warned that a chunk exceeds 500 kB. Size finding only, not a confirmed exploit. |
| ISS-018 | Vercel Edge middleware runtime is deprecated | Reported by the October 24 deployment. The runtime was not changed or re-investigated here. Not a confirmed exploit. |
| ISS-019 | Browserslist data is outdated | This session's production build printed that caniuse-lite data is 16 months old. Not updated in this batch. |

## Deferred

| ID | Item | Notes |
| --- | --- | --- |
| ISS-008 | Real-time feed upgrades | Out of scope until a later batch. |
| ISS-009 | AI Trader | Dashboard route exists. `AI_TRADER_CURRENT_OPERATING_MODE` is `OFF`. Shadow worker must not be expanded in product batches. |
| ISS-010 | Broker integration | No broker batch is approved. |
| ISS-011 | Billing go-live | `ProPage` and `AccountPage` say payment processing is being set up. Stripe functions exist. Live Stripe state was not checked. |
| ISS-012 | Further SEC schedule or write-gate edits | Cron job 52 is already the historical production schedule. Do not reapply Gate I.3 or edit that schedule from an app PR. |
| ISS-013 | Community | `/dashboard/community` is a waitlist page. |
| ISS-014 | Sitemap omissions | Integrity info, not a failure: 27 public or redirect routes are absent from the main sitemap, including `/etfs`, tool calculators, `/advertise`, `/download`, and `/support`. `/etfs/screener` is the canonical screener URL. |

## Historically verified

| ID | Item | Boundary |
| --- | --- | --- |
| ISS-004 | Gate I.3 production activation completed: circuit-breaker migration applied, `sync-sec-edgar-filings` deployed, scheduled ingestion on cron job 52, then a scheduled run inserted 22 records and advanced the checkpoint | Historical record supplied for PR #163. This session did not re-query the live database, Edge deployment, cron entry, or current checkpoint. |

## Not a defect

- MCP server id `hedgefun-mcp` with public title `Stocksist Market Data`. Leave the generated bundle on the PR #162 contents.
- `cursor/lovable-sync-from-main-20261024` is the active Lovable integration branch and matches `main` in file contents after PR #162.
- `cursor/chat-single-pass-v1` remains archived. The analyst commits were cherry-picked; the branch was not merged. Its old divergence is not a current production synchronization problem.
- ISS-001 is closed in `docs/CHANGELOG.md`. The recovered code is in git. Production chat still waits on ISS-015.
