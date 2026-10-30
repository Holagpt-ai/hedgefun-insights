# Issue register

Keep this list short. Move fixed items to `docs/CHANGELOG.md`. Labels: **confirmed**, **reported**, **deferred**.

**Baseline:** `origin/main` **`07172bd6`** (2026-10-30); Batch 190.8 draft PR #201, not merged. Master backlog: `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`.

Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md` — disposition in master backlog §4; do not reassign all ten wholesale.

## Current active triage

| ID | Priority | Open item | Status / next action |
| --- | --- | --- | --- |
| **ISS-034** | **P0** | Scanner finalization after session transition; stale six-tab publication | **CONFIRMED OPEN.** Batch 190.7 migration/Edge deployed; Gate 4 FAILED. Postdeploy 21:15/21:45/22:15/22:45 UTC, all 13,267 symbols/7 chunks, `finalize_failed:build_rows:internal_error`; last successful publish 20:10:02 UTC (108 rows). **Reproduced cause:** Day Trade Radar selection admits `min.t` market / `updated` after-hours mismatch, `baseRow` rejects unresolved session. Actual production ticker not identified. **190.8 draft PR #201** guards both selection paths; tests/CI, merge, Lovable Edge deploy and three fresh after-hours/premarket publications PENDING. **DO NOT CLOSE.** |
| ISS-033 | P0 | Premarket `day.v=0` vs `min.av` | **Fixed in git + Edge D1 deployed** (`23980c31…`). Processing evidence supports D1; **timed premarket acceptance PENDING** (**Batch 191**). |
| ISS-024 | P0 | Tab evidence / Gappers inputs | Batch **185** merged; fresh post-#194 publication **blocked by ISS-034** → **Batch 191**. |
| ISS-025 | P0 | AM Inbox continuation loading | Batch **186** merged; RPC **PASS**; UI **NOT VERIFIED** → **Batch 192**. |
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
