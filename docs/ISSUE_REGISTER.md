# Issue register

Keep this list short. Move an item to `docs/CHANGELOG.md` when it is fixed. Labels: **confirmed** (checked this session against `main` or a command), **reported** (older doc, not rechecked), **deferred** (intentionally not in progress).

Baseline: `origin/main` `b735073b` (PR #168 merged); PR **#169 OPEN** (scanner reliability); PR **#170** (security / performance / Monday readiness) pending merge. ISS-001 is closed by the catalyst evidence recovery on `main`. **ISS-015** remains open until production `chat` deploy is verified.

## Confirmed

| ID | Item | Evidence |
| --- | --- | --- |
| ISS-002 | Registered navigation has no broken route | `npm run integrity` on 2026-10-24 after the analyst recovery: 0 errors, 0 warnings, 125 routes. Coverage is the nav file list in `scripts/integrity/lib/navigation.mjs`, not every link in the app. |
| ISS-003 (Fly radar worker) | Live `stocksist-radar-v22-worker` release **v45** matches approved scanner **behavior** on `main` through `b735073b` | Read-only Fly check 2026-10-24: image `deployment-01M5CRQST4MR22JBA8AJK972H2`, digest `sha256:47ff670c6cbefc43ff01cc87c2e1387f20f4c21a734b45558e7b4a35b901979e`. Worker Docker COPY set diff vs `8f354261` (v45-era `main`) is doc-only / unused modules — **PASS**, redeploy not required for ranking parity. **Exact git SHA baked into the image is unverified** (Fly tag is not a commit). |
| ISS-003 (Vercel SPA) | Production asset manifest updated after PR #168 | 2026-10-24 read: `https://stocksist.com/asset-manifest.json` → `index-Drz78K0e.js`. Manifest has no git SHA; hash change is consistent with Vercel deploy, not commit proof alone. |
| ISS-020 | Polygon snapshot `day.v=0` was treated as verified zero volume (Batch 27 failure vs PR #167 ranking) | **Fixed in git** (PR #169) — `polygonSnapshotVolume()` nulls Polygon zero; explicit verified zero from cache still ranks before unknown. See `docs/release/scanner-live-market-acceptance-v1.md`. **Live RTH acceptance still pending.** |
| ISS-016 | npm audit reported 42 advisories on October Vercel deploy | **Partially mitigated** (PR #170): `npm audit fix` (no `--force`) → **21** (2 critical, 7 high, 12 moderate); `react-router-dom@6.30.6`. Remaining blockers in `docs/release/npm-security-remediation-2026-10-24.md`. Not a confirmed production exploit. |
| ISS-017 | Production JavaScript entry bundle was ~3.46 MB before gzip | **Improved in git** (PR #170): route-level lazy loading; local prod build main chunk **`index-78kNLD9N.js` ~2,655.90 kB** (gzip ~750 kB) vs prior single chunk ~3,461 kB. Vite 500 kB chunk warning remains on entry. |
| ISS-019 | Browserslist / caniuse-lite data was outdated | **Mitigated** (PR #170): `npx update-browserslist-db@latest` via npm lockfile; production build no longer prints the 16-month stale-data warning (2026-10-24). |
| ISS-015 | Production `chat` does not yet run the recovered catalyst delivery | Approved source on `main` (`10723434`). Live Edge revision is not assumed to match git. Follow `docs/release/edge-function-release-lovable.md`; capture Lovable Cloud version id before deploy. Behavior changes only after Lovable Cloud deploy of `chat` and verification. |

## Reported

| ID | Item | Why it is not confirmed |
| --- | --- | --- |
| ISS-003 (Edge) | Production Supabase Edge revision ids are unknown | Vercel js hash observed (see Confirmed). Edge version ids not read from Lovable Cloud. |
| ISS-005 | Batch 34 still records migration apply and Edge version status as unknown | `docs/release/batch34-production-release-manifest.md`. Not refreshed against production. |
| ISS-006 | Catalyst source activation was planned and not executed in Batch 34 | `docs/catalyst-intelligence/batch34-catalyst-activation-sequence.md`. |
| ISS-007 | AI Analyst generation and streaming failures were explicitly deferred in Batch 34 | Same manifest, section on remaining work. Not retested here. |

## Deferred

| ID | Item | Notes |
| --- | --- | --- |
| ISS-018 | Vercel Edge middleware runtime deprecation notice | Investigated 2026-10-24: `middleware.ts` uses `@vercel/functions/next`; redirects and robots live in `vercel.json`. No compatible minimal runtime migration without platform mandate. See `docs/release/vercel-middleware-runtime-2026-10-24.md`. |

## Deferred (product)

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
