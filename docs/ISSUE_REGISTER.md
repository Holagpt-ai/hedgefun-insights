# Issue register

Keep this list short. Move fixed items to `docs/CHANGELOG.md`. Labels: **confirmed**, **reported**, **deferred**.

**Baseline:** `origin/main` **`a5df10d8`** (2026-11-03). Batch **191** continuity merged (PR **#207**). Batches 190.9-190.11 are merged. November 1 deployment/integration source for `sync-screener-data` is reported as `ccb4055b3f8b84c46fa38529844150c140638705`. November 2 naturally scheduled premarket acceptance is reported PASS (04:00-04:30 ET, seven consecutive successful publications, latest row counts 60/62/63, no new recorded `http_409` failures). Master backlog: `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`.

Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md` — disposition in master backlog §4; do not reassign all ten wholesale.

## Current active triage

| ID | Priority | Open item | Status / next action |
| --- | --- | --- | --- |
| **ISS-034** | **P0** | Scanner acceptance not complete across all market sessions | **CONFIRMED OPEN.** November 1 deployment/integration source is reported as `ccb4055b…`. November 2 premarket acceptance window is reported PASS (seven consecutive successful publications, 04:00-04:30 ET, no new recorded `http_409` failures). This does **not** close full-session acceptance. Remaining required evidence: naturally scheduled regular-session publications, naturally scheduled after-hours publications, six-tab generation/publication identifier consistency in those windows, and session/timestamp correctness. Mark any missing windows **NOT VERIFIED**. |
| ISS-033 | P0 | Premarket `day.v=0` vs `min.av` | **Fixed in git + Edge D1 deployed** (`23980c31…`). November 2 premarket acceptance window reported **PASS**. Keep broader Batch 191 matrix open until regular and after-hours checks are verified. |
| ISS-024 | P0 | Tab evidence / Gappers inputs | Batch **185** merged. Premarket publication evidence reported PASS on Nov 2; regular-session and after-hours tab-evidence acceptance remains **NOT VERIFIED** under **Batch 191**. |
| ISS-025 | P0 | AM Inbox continuation loading | Batch **186** merged; RPC **PASS**; Batch **192** (PR **#208**) fixes RVOL metadata leak, brief evidence cutoff, and loading gate; authenticated visual acceptance **NOT VERIFIED**. |
| ISS-032 | P2 | Journal terminal-error loading | Fixed on `main` (Batch **188**) → **Batch 193** acceptance. |
| ISS-026 | P1 | Earnings ranking / Edge | Batch **187** merged; Edge activation **UNVERIFIED** → **Batch 194**. |
| ISS-027 | P1 | Risk / AI Brief mobile layout | Fixed on `main` (Batch **188**) → **Batch 193**. |
| ISS-028 | P1 | TSLA/SpaceX direct catalyst in UI | Batch **181** in git; prod **NOT RE-VERIFIED** → **Batch 195**. |
| ISS-029 | P2 | Homepage AI Trader / countdown | **Fixed** (Batch **189**). |
| ISS-030 | P2 | Carryover mobile cards | Fixed on `main` (Batch **188**) → **Batch 193**. |
| ISS-031 | P1 | Homepage movers vs Radar tabs | Explained — different universes. |

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

## Deferred (product / platform)

| ID | Item | Master batch |
| --- | --- | --- |
| ISS-008 | Real-time feed | **205** |
| ISS-009 | AI Trader | **208** |
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
