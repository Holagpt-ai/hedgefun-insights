# Issue register

Keep this list short. Move an item to `docs/CHANGELOG.md` when it is fixed. Labels: **confirmed** (checked this session against `main` or a command), **reported** (older doc, not rechecked), **deferred** (intentionally not in progress).

Baseline: `origin/main` **`7c2bf094`** (PR **#179** / Batch **178** merged). PR **#174** open and conflicting (pre-session Monday docs only). ISS-001 closed on `main`. **ISS-015** **blocked** until previous production `chat` Edge version is recoverable.

Original ten Lovable scanner warnings (historical, not the active backlog): `docs/release/lovable-scanner-reliability-warnings.md`. October 24 npm and deploy findings stay on ISS-015 through ISS-019 (`docs/release/lovable-october24-warning-register.md`). Next batches: `docs/release/next-approved-batches.md`.

## Confirmed

| ID | Item | Evidence |
| --- | --- | --- |
| ISS-002 | Registered navigation has no broken route | `npm run integrity`: 0 errors, 0 warnings, 125 routes (2026-10-24). |
| ISS-003 (Fly radar worker) | Live `stocksist-radar-v22-worker` **v45** matches scanner behavior on approved `main` | Read-only Fly check 2026-10-24: digest `sha256:47ff670c…`. **PASS** — redeploy not required for ranking parity. Image git SHA unverified. |
| ISS-020 | Polygon snapshot `day.v=0` treated as verified zero volume | **Fixed on `main`** (#169) — `polygonSnapshotVolume()`; batch27 / movers-integrity tests. Regular lists still do not treat `0` as liquidity. |
| ISS-021 | Premarket tab listed regular-session snapshots | **Fixed on `main`** (PR **#179** → **`7c2bf094`**, Batch 178). Pre-merge production evidence 2026-10-26 afternoon documented in batch178 runbook. **Live Vercel after deploy not re-checked.** |
| ISS-016 | npm audit 42 advisories (Oct Vercel report) | **Partially mitigated:** #170 → 21; Batch 171 → **20** (**0 critical**), `tinypool@2.2.0` override, `vite@5.4.21`, `vitest@3.2.7`. Remaining: MCP sdk, zod/@vercel, router v7, tailwind build chain. |
| ISS-017 | Large production JS entry bundle | **Improved:** #170 ~2,656 kB entry; Batch 171 public-route lazy **~2,271 kB** (`index-C5m1D5LX.js`, gzip ~633 kB). Vite >500 kB warning remains. |
| ISS-019 | Browserslist / caniuse-lite outdated | **Mitigated** (#170). |
| ISS-015 | Production `chat` not on recovered catalyst delivery | **Blocked** — rollback revision id unknown. `docs/release/edge-function-release-lovable.md`. No deploy this batch. |
| ISS-022 | Ticker-specific catalyst/watchlist headlines could name unrelated issuers when persisted `direct` disagreed with title | **Fixed on PR #180 branch** (Batch **181**) — live reconcile + headline gates; runbook `docs/release/batch181-catalyst-watchlist-source-integrity-v1.md`. Stale DB rows may still need sync/reconcile jobs. |

## Reported

| ID | Item | Why it is not confirmed |
| --- | --- | --- |
| ISS-003 (Vercel SPA) | Production manifest vs latest merge | Manifest has no git SHA; refresh after #179 Vercel deploy. |
| ISS-003 (Edge) | Production Edge revision ids unknown | Not read from Lovable Cloud. |
| ISS-005 | Batch 34 migration/Edge status unknown | Not refreshed against production. |
| ISS-006 | Catalyst intel → public distribution | **Source bridge complete** on `main` (Batch **176**, PR **#175**, `788b1b93`). **Production activation incomplete** — no Edge deploy, no writes, no cron; source enablement still separate. |
| ISS-007 | AI Analyst streaming failures deferred in Batch 34 | Not retested here. |

## Deferred

| ID | Item | Notes |
| --- | --- | --- |
| ISS-018 | Vercel Edge middleware runtime deprecation | `docs/release/vercel-middleware-runtime-2026-10-24.md`. |

## Deferred (product)

| ID | Item | Notes |
| --- | --- | --- |
| ISS-008 | Real-time feed upgrades | Out of scope. |
| ISS-009 | AI Trader | Operating mode OFF. |
| ISS-010 | Broker integration | Not approved. |
| ISS-011 | Billing go-live | Stripe state not checked. |
| ISS-012 | SEC schedule / write-gate edits | Cron job 52 is production schedule. |
| ISS-013 | Community | Waitlist page. |
| ISS-014 | Sitemap omissions | Integrity info only. |

## Historically verified

| ID | Item | Boundary |
| --- | --- | --- |
| ISS-004 | Gate I.3 SEC activation (migration, deploy, cron 52, checkpoint) | Historical PR #163 record; not re-queried live. |

## Not a defect

- MCP id `hedgefun-mcp` / generated bundle per PR #162.
- `cursor/lovable-sync-from-main-20261024` active integration branch.
- `cursor/chat-single-pass-v1` archived recovery source only.
- ISS-001 closed in git; production chat waits on ISS-015.
