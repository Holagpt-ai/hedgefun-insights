# Issue register

Keep this list short. Move fixed items to `docs/CHANGELOG.md`. Labels: **confirmed**, **reported**, **deferred**.

**Baseline:** `origin/main` **`0db6063f`** (2026-11-04). Batch **196.2** merged (PR **#211**); Batch **196.1** Fly v46 / scanner integrity (**#209**/**#210**); Fly worker **v46** deployed. Batch **195** issuer-trust acceptance in review. Batch **192** merged (PR **#208**); Batch **191** continuity (PR **#207**). Batches 190.9-190.11 are merged. November 1 deployment/integration source for `sync-screener-data` is reported as `ccb4055b3f8b84c46fa38529844150c140638705`. November 2 naturally scheduled premarket acceptance is reported PASS (04:00-04:30 ET, seven consecutive successful publications, latest row counts 60/62/63, no new recorded `http_409` failures). Master backlog: `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`.

Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md` — disposition in master backlog §4; do not reassign all ten wholesale.

## Current active triage

| ID | Priority | Open item | Status / next action |
| --- | --- | --- | --- |
| **ISS-034** | **P0** | Scanner acceptance not complete across all market sessions | **CONFIRMED OPEN.** Nov **4 20:55:47 UTC**: `sync-screener-data` **v506** — 7/7 chunks complete, **finalize HTTP 546 CPU Time exceeded**, lease held, **no publish** (same 546 pattern earlier Nov 4). Stranded **`finalizing`** job **`2fe9fca8…`** / gen **`09346799…`** (65 rows RPC recorded, completion never ran). pg_cron **`{}`** body (**Batch 190.13** Edge fix pending). **Batch 190.12** reconcile in git (**#213**); Lovable apply **owner pending**. **Batch 190.14** (PR pending, base **`3bd3ee68`**): finalize CPU reductions — single-pass G/L evidence, defer day-trade capture, stage timings. Nov 2 premarket PASS preserved. |
| ISS-033 | P0 | Premarket `day.v=0` vs `min.av` | **Fixed in git + Edge D1 deployed** (`23980c31…`). November 2 premarket acceptance window reported **PASS**. Keep broader Batch 191 matrix open until regular and after-hours checks are verified. |
| ISS-024 | P0 | Tab evidence / Gappers inputs | Batch **185** merged. Premarket publication evidence reported PASS on Nov 2; regular-session and after-hours tab-evidence acceptance remains **NOT VERIFIED** under **Batch 191**. |
| ISS-025 | P0 | AM Inbox continuation loading | Batch **192** merged (**#208**); Vercel + `generate-daily-brief` deploy **reported complete**; authenticated visual acceptance **NOT VERIFIED**. |
| ISS-036 | P1 | Extreme / unreliable volume acceleration display | Batch **196.1** merged (`797cc615`) and Fly **v46** deployed 2026-11-04. Worker `/health` **running**, Polygon subscribed. Live acceleration-value acceptance **NOT VERIFIED** (no sampled rows this window). |
| ISS-032 | P2 | Journal terminal-error loading | Fixed on `main` (Batch **188**) → **Batch 193** acceptance. |
| ISS-026 | P1 | Earnings ranking / Edge | Batch **187** merged; Edge activation **UNVERIFIED** → **Batch 194**. |
| ISS-027 | P1 | Risk / AI Brief mobile layout | Fixed on `main` (Batch **188**) → **Batch 193**. |
| ISS-028 | P1 | TSLA/SpaceX direct catalyst in UI | Batch **195**: Batch **181** paths **PASS** in source/tests; Radar recent-news SpaceX-primary slip **fixed** (pending PR). Authenticated Catalyst/Watchlist/Action Center/Radar prod **NOT VERIFIED** — **cannot close**. |
| ISS-029 | P2 | Homepage AI Trader / countdown | **Fixed** (Batch **189**). |
| ISS-030 | P2 | Carryover mobile cards | Fixed on `main` (Batch **188**) → **Batch 193**. |
| ISS-031 | P1 | Homepage movers vs Radar tabs | Explained — different universes. |
| **ISS-037** | P2 | Screener free-float missing or unreliable | **CONFIRMED DEFECT (source traced).** Production Nov 4: published rows keep `float_shares` NULL by design; UI lacked verified free-float display. **Fix in review:** PR **#215** — frontend `useRadarFloatForSymbols` on scanner/radar visible rows; float freshness from Massive `as_of` only; Short Float independent. Publication path must not call Polygon float. Day Trade Five Pillars / unknown-float qualification unchanged. Production verification **NOT VERIFIED** until Vercel deploy. |

**Verification (not new implementation):** Batch **174** **CONDITIONAL**; Batch **175** persistence **PASS**, UI **NOT VERIFIED**; PR **#174** **CLOSED** unmerged.

## Confirmed

| ID | Item | Evidence |
| --- | --- | --- |
| ISS-002 | Navigation routes | `npm run integrity` (2026-10-24). |
| ISS-003 (Fly) | Radar worker v45 parity | Read-only 2026-10-24 **PASS**. |
| ISS-020 | `day.v=0` missing volume | Fixed #169. |
| ISS-021 | Premarket session labels | Batch **178**. |
| ISS-016–019 | npm / bundle / browserslist | Partially mitigated; remainder **Batch 202** / **198**. |
| ISS-015 | Production `chat` not on recovered delivery | **Blocked** — batch **204**. |
| ISS-022 | Catalyst headline issuer mismatch | Batch **181**. |
| ISS-023 | Mobile navigation freeze | Fixed git Batch **184**; mobile re-check **Batch 193**. |

## Reported

| ID | Item | Notes |
| --- | --- | --- |
| ISS-003 (Vercel/Edge) | Manifest / revision ids | Partial screener fingerprints recorded Oct 28; full matrix unknown. |
| ISS-005 | Batch 34 status | Not refreshed. |
| ISS-006 | Catalyst distribution | Deferred — **Batch 203**. |
| ISS-007 | AI Analyst streaming | Deferred — **Batch 204**. |
| ISS-037 | Screener free-float reliability | See active triage; **NOT VERIFIED** — investigation deferred post–Batch **196.2**. |

## Deferred (product / platform)

| ID | Item | Master batch |
| --- | --- | --- |
| ISS-008 | Real-time feed | **205** |
| ISS-009 | AI Trader | **208 — POST-LAUNCH PAUSED** |
| ISS-010 | Broker | **207** |
| ISS-011 | Billing | **206** |
| ISS-012 | SEC schedule edits | No new batch unless new evidence |
| ISS-013 | Community | **209** |
| ISS-014 | Sitemap | **202** conditional |
| ISS-018 | Middleware deprecation | **198** / **202** |

## Historically verified

| ID | Item | Boundary |
| --- | --- | --- |
| ISS-004 | Gate I.3 SEC activation | Historical PR #163. |

## Not a defect

- MCP id `hedgefun-mcp` / generated bundle.
- Lovable integration branch role and protected files.
