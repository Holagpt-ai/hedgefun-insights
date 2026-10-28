# Next approved product batches

**Superseded for active work (2026-10-28):** Implementation and verification queue **190–209** lives in **`docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`** (Master Continuity Sync V4). This file retains the **171–189** historical register only.

Register baseline: GitHub `main` **`1398d16a`** (PR **#194** merged). Product batch ids are not always GitHub PR numbers.

| Batch | Name | Status |
| --- | --- | --- |
| **171** | Security & performance V2 | **Merged** → `88de0ae8` |
| **172** | Catalyst Source Coverage V1 | **Merged** → `93a3c35d` |
| **173** | Watchlist / historical handoff integrity | **Merged** → `28cbcc9e` |
| **174** | Monday live scanner acceptance | **CONDITIONAL** — verification under master batch **191**; PR **#174** **closed without merge** |
| **175** | Continuation & inbox acceptance | **Persistence PASS**; AM Inbox UI **NOT VERIFIED** — verification under master batch **192** |
| **176** | Catalyst intel distribution bridge V1 | **Merged** — PR **#175** → **`788b1b93`**; activation gated (**ISS-006**, batch **204**) |
| **177** | Lovable forward-sync & continuity | **Merged / ops** — PR **#176** → **`1002c682`**; integration tip **`04da6d7f`** (2026-10-28) |
| **178** | Scanner session integrity V1 | **Merged** — PR **#179** → **`7c2bf094`** |
| **179** | Public website & conversion V1 | **Merged** — PR **#177** → **`dc42cfe5`** |
| **180** | Public navigation & UX integrity V1 | **Merged** — PR **#178** → **`d4095c86`** |
| **181** | Catalyst + Watchlist source integrity V1 | **Merged** — PR **#180** → **`aae43f98`** |
| **182** | Five Pillars qualification transparency V1 | **Merged** — PR **#181** → **`0542ee10`** |
| **183** | Desktop Day Trade Radar workspace tabs V1 | **Merged** — PR **#182** → **`3ef97ee1`** |
| **184** | Mobile navigation stability | **Merged** — PR **#186** → **`0fa177dd`**; mobile acceptance **pending** |
| **185** | Scanner evidence & input reliability | **Merged** — PR **#187** → **`e662c928`** |
| **186** | AM Inbox continuation | **Merged** — PR **#189** → **`d3cec11f`** |
| **187** | Earnings intelligence | **Merged** — PR **#190** → **`d86e0c69`**; Edge activation **pending** (batch **194**) |
| **188** | Mobile dashboard & Journal reliability | **Merged** — PR **#191** → **`dc965d2d`**; acceptance **pending** (batch **193**) |
| **189** | Homepage final cleanup | **Merged** — PR **#192** → **`68092518`** |

**Next authorized development batch:** **190** — CPU-safe scanner execution and atomic publication (**ISS-034**). See master backlog.

**Ops gate (parallel, deferred):** **ISS-015** — Lovable **`chat`-only** Edge deploy (batch **203**). **Blocked.**

Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md`. npm/deploy findings: ISS-016 through ISS-019.

**Deferred product (unapproved):** Penny Continuation distinct from **`penny`** panel — batches **199–200** in master backlog.
