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
