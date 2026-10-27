# Issue register

Keep this list short. Move an item to `docs/CHANGELOG.md` when it is fixed. Labels: **confirmed** (checked this session against `main` or a command), **reported** (older doc, not rechecked), **deferred** (intentionally not in progress).

Historical baseline: `origin/main` **`e662c928`** (PR **#187** Batch 185 merged). Prior **`0fa177dd`** (PR **#186**). **PR #174 closed without merge**. Batch **174** **CONDITIONAL**. Batch **175** persistence **PASS** (RPC, 2026-10-26 ET); AM Inbox UI **NOT VERIFIED**. ISS-001 closed on `main`. **ISS-015** **blocked** until previous production `chat` Edge version is recoverable.

Original ten Lovable scanner warnings (historical): `docs/release/lovable-scanner-reliability-warnings.md` — treat as **fixed in git**, **mitigated** (Batch 185 client/Edge), or **operationally unverified** (Vercel/mobile) per item; Oct 27 Lovable read-only feed evidence **PASS** for RPC/evidence column. October 24 npm/deploy: ISS-015–019. Next batches: `docs/release/next-approved-batches.md`.

## Current active triage — 2026-10-27 screenshots (reported, not backend-confirmed)

Source: authenticated Android Chrome captures 08:06–08:15 ET; code cross-check at `main` `e662c928`. Full evidence/order: `docs/release/master-reset-2026-10-27.md`. Old fixes stay in changelog; do not relabel those as open defects.

| ID | Priority | Open item | Status / next action |
| --- | --- | --- | --- |
| ISS-024 | P0 | Missing scanner gap input and tab-evaluation evidence | **Batch 185 merged (`e662c928`)** — client `publication_confirmed` + Edge PATCH path. Lovable **Oct 27 read-only**: feed **115 rows**, tabs evaluated, 5-arg RPC + evidence **PASS**. Gappers premarket may still need Radar restore when sync marks inputs unavailable. Vercel deploy + UI acceptance **NOT VERIFIED** here. |
| ISS-025 | P0 | AM Inbox continuation never exits loading despite 2,056 Monday records | **Observed UI / persistence previously PASS**; Batch **186** authenticated display; Batch **184** client fixes in PR **#186** (merge + mobile verify pending) |
| ISS-026 | P1 | Earnings significance not reflected in surfaced order | **Observed UI / code filter+cap verified**; Batch 187 deterministic ranking and confirmed schedule coverage |
| ISS-027 | P1 | Risk flags blank height / brief preview text clipping | **Observed UI**; Batch **188** mobile layout (Volume Leaders skeleton addressed in PR **#186**, not production-verified) |
| ISS-028 | P1 | TSLA SpaceX news shown as direct catalyst in deployed UI | **Observed UI**; verify Batch 181 production paths before DB changes; bounded reconciliation only |
| ISS-029 | P2 | Homepage AI Trader banner remains; market-open countdown ambiguous | **Observed UI**; Batch 189 honor approved no-AI-Trader homepage |
| ISS-030 | P2 | Mobile Carryover Watch repetitive oversized cards | **Observed UI**; Batch 188 compact/expand disclosure |
| ISS-031 | P1 | Homepage movers populated while authenticated Radar evidence tabs unavailable | **Explained in Batch 185 runbook** — Polygon snapshot movers vs screener publication; Oct 27 morning UI predated evidence persistence. Not a universe substitute. |
| ISS-032 | P2 | JournalWorkspace terminal-error loading state | **Confirmed defect** — journal routes can surface terminal error during load; fix deferred to dedicated UI batch. |

**Acceptance:** PR #174 CLOSED unmerged; PR #184 MERGED (`0fa177dd`); PR #185 MERGED (`e662c928`). Batch 174 conditional; Batch 175 Monday→Tuesday persistence PASS, authenticated AM display NOT VERIFIED. Lovable screener read-only Oct 27 **PASS**; migration history / Edge revision **UNKNOWN**. No screener migration or Edge redeploy required by that check alone.

## Confirmed

| ID | Item | Evidence |
| --- | --- | --- |
| ISS-002 | Registered navigation has no broken route | `npm run integrity`: 0 errors, 0 warnings, 125 routes (2026-10-24). |
| ISS-003 (Fly radar worker) | Live `stocksist-radar-v22-worker` **v45** matches scanner behavior on approved `main` | Read-only Fly check 2026-10-24: digest `sha256:47ff670c…`. **PASS** — redeploy not required for ranking parity. Image git SHA unverified. |
| ISS-020 | Polygon snapshot `day.v=0` treated as verified zero volume | **Fixed on `main`** (#169) — `polygonSnapshotVolume()`; batch27 / movers-integrity tests. Regular lists still do not treat `0` as liquidity. |
| ISS-021 | Premarket tab listed regular-session snapshots | **Fixed on `main`** (PR **#179** → **`7c2bf094`**, Batch 178). 2026-10-26 ~12:33–12:56 ET **UI observation** showed mislabeled rows pre-fix; ~17:00 ET post–Batch **183** manifest premarket page **empty** with delayed disclosure (**UI observation**, not full ET-window proof). |
| ISS-016 | npm audit 42 advisories (Oct Vercel report) | **Partially mitigated:** #170 → 21; Batch 171 → **20** (**0 critical**), `tinypool@2.2.0` override, `vite@5.4.21`, `vitest@3.2.7`. Remaining: MCP sdk, zod/@vercel, router v7, tailwind build chain. |
| ISS-017 | Large production JS entry bundle | **Improved:** #170 ~2,656 kB entry; Batch 171 public-route lazy **~2,271 kB** (`index-C5m1D5LX.js`, gzip ~633 kB). Vite >500 kB warning remains. |
| ISS-019 | Browserslist / caniuse-lite outdated | **Mitigated** (#170). |
| ISS-015 | Production `chat` not on recovered catalyst delivery | **Blocked** — rollback revision id unknown. `docs/release/edge-function-release-lovable.md`. No deploy this batch. |
| ISS-022 | Ticker-specific catalyst/watchlist headlines could name unrelated issuers when persisted `direct` disagreed with title | **Fixed on `main`** (Batch **181**, PR **#180** → **`aae43f98`**) — live reconcile + headline gates; runbook `docs/release/batch181-catalyst-watchlist-source-integrity-v1.md`. Stale DB rows may still need sync/reconcile jobs. |
| ISS-023 | Mobile browser freeze after workflow link taps (Pre-Market, Carryover) | **Fixed in git (PR #186 → `0fa177dd`)** — sessionStorage mirror batching/skip, deferred handoffs, same-destination nav guard. Production mobile re-check **NOT VERIFIED**. |

## Reported

| ID | Item | Why it is not confirmed |
| --- | --- | --- |
| ISS-003 (Vercel SPA) | Production manifest vs latest merge | Manifest has no git SHA; refresh after #179/#180 Vercel deploy. |
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
