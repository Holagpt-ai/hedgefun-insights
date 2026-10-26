# Next approved product batches

Register updated **2026-10-26** against **`main` `d4095c86`** (PR **#178** / Batch 180 merged). Product batch ids are not always GitHub PR numbers.

| Batch | Name | Status |
| --- | --- | --- |
| **171** | Security & performance V2 | **Merged** → `88de0ae8` |
| **172** | Catalyst Source Coverage V1 | **Merged** → `93a3c35d` |
| **173** | Watchlist / historical handoff integrity | **Merged** → `28cbcc9e` (supersedes the earlier **177** watchlist-only plan) |
| **174** | Monday live scanner acceptance | **PR #174 OPEN, conflicting** — pre-session docs only. 2026-10-26 afternoon check did not close the 4:00 a.m.–8:00 p.m. matrix |
| **175** | Continuation & inbox acceptance | **Pending** — still after a real Monday sign-off |
| **176** | Catalyst intel distribution bridge V1 | **Merged** — PR **#175** → **`788b1b93`**; activation still gated (**ISS-006**) |
| **177** | Lovable forward-sync & continuity | **Merged / ops** — PR **#176** → **`1002c682`**; integration branch may forward-sync normally |
| **178** | Scanner session integrity V1 | **PR #179 OPEN** — head `2d13dcd3`. Premarket tab no longer relabels regular-session snapshots. Not merged. See `docs/release/batch178-scanner-session-integrity-v1.md` |
| **179** | Public website & conversion V1 | **Merged** — PR **#177** → **`dc42cfe5`**; Vercel SUCCESS |
| **180** | Public navigation & UX integrity V1 | **Merged** — PR **#178** → **`d4095c86`** |
| **181** | Catalyst / watchlist source-integrity corrections | **Next** — relevance and source labels. No Edge activation (**ISS-006**) |
| **182** | Transparent Five Pillars qualification | **Pending** — after Batch **181** |
| **183** | Desktop Day Trade Radar tab restructuring | **Scheduled separately** — not part of 178–182 |

**Ops gate (parallel):** **ISS-015** — Lovable **`chat`-only** Edge deploy when previous revision id is recoverable (`docs/release/edge-function-release-lovable.md`). **Blocked.**

Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md`. npm/deploy findings: ISS-016 through ISS-019.
