# Next approved product batches

Register updated **2026-10-26** after **`main` `13a018a9`** (PR **#183** merged). Product batch ids are not always GitHub PR numbers.

| Batch | Name | Status |
| --- | --- | --- |
| **171** | Security & performance V2 | **Merged** → `88de0ae8` |
| **172** | Catalyst Source Coverage V1 | **Merged** → `93a3c35d` |
| **173** | Watchlist / historical handoff integrity | **Merged** → `28cbcc9e` (supersedes the earlier **177** watchlist-only plan) |
| **174** | Monday live scanner acceptance | **CONDITIONAL** — matrix in `monday-scanner-acceptance-2026-10-26.md`; PR **#174** superseded — **close without merge** |
| **175** | Continuation & inbox acceptance | **CONDITIONAL PASS (persistence)** — RPC verified 2026-10-26 ET; AM Inbox UI **NOT VERIFIED** (`batch175-tuesday-production-acceptance-2026-10-27.md`) |
| **176** | Catalyst intel distribution bridge V1 | **Merged** — PR **#175** → **`788b1b93`**; activation still gated (**ISS-006**) |
| **177** | Lovable forward-sync & continuity | **Merged / ops** — PR **#176** → **`1002c682`** |
| **178** | Scanner session integrity V1 | **Merged** — PR **#179** → **`7c2bf094`** |
| **179** | Public website & conversion V1 | **Merged** — PR **#177** → **`dc42cfe5`** |
| **180** | Public navigation & UX integrity V1 | **Merged** — PR **#178** → **`d4095c86`** |
| **181** | Catalyst + Watchlist source integrity V1 | **Merged** — PR **#180** → **`aae43f98`** |
| **182** | Five Pillars qualification transparency V1 | **Merged** — PR **#181** → **`0542ee10`** |
| **183** | Desktop Day Trade Radar workspace tabs V1 | **Merged** — PR **#182** → **`3ef97ee1`** |

**Ops gate (parallel):** **ISS-015** — Lovable **`chat`-only** Edge deploy when previous revision id is recoverable (`docs/release/edge-function-release-lovable.md`). **Blocked.**

Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md`. npm/deploy findings: ISS-016 through ISS-019.

**Deferred product batch (not approved):** **Penny Continuation** as a distinct momentum-continuation scanner — not present in git; do not conflate with the **`penny`** price-band panel.

## Active proposal — 2026-10-27, NOT yet approved for production

**Current main:** **`dc965d2d`** (PR **#191** Batch 188). Batch 171–173, 176–188 **merged in git** (188 mobile acceptance pending). PR #174 **closed unmerged**. Full reconciliation: `master-reset-2026-10-27.md`.

| Proposed batch | Focus | Precondition |
| --- | --- | --- |
| **184** | P0 Android/mobile navigation freeze and terminal loading states | **In PR #186** — merge + authenticated mobile verify; not production until Vercel deploy |
| 185 | P0 Gappers, Gainers/Losers, New Highs/Lows input/evidence paths | Examine existing generator and verified prior-close restoration |
| 186 | P0 Tuesday AM Inbox late-continuation surface | Use already-proven RPC persistence; require authenticated UI evidence |
| 187 | P1 Earnings impact ranking and ticker attribution runtime | Preserve confirmed vs scheduled event types; verify issuer relevance |
| **188** | Mobile dashboard & Journal reliability V1 | **Merged** — PR **#191** → **`dc965d2d`**; authenticated Android acceptance **pending** |
| **189** | Homepage AI Trader removal, countdown and Market Pulse UX | **In PR** — `batch189-homepage-final-cleanup-v1.md` |

Separately: **Batch 174 live acceptance incomplete; Batch 175 persistence PASS, UI conditional.** Defer ISS-006 source activation; ISS-015 chat blocked; Penny Continuation unapproved; no real-time feed upgrade, AI Trader, broker or billing. No PR merges, migrations or deployments are authorized by this documentation.
