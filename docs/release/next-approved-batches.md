# Next approved product batches

Register updated **2026-10-25** after **`main` `dc42cfe5`** (PR **#177** / Batch 179 merged). Product batch ids are not always GitHub PR numbers.

| Batch | Name | Status |
| --- | --- | --- |
| **171** | Security & performance V2 | **Merged** → `88de0ae8` |
| **172** | Catalyst Source Coverage V1 | **Merged** → `93a3c35d` |
| **173** | Watchlist / historical handoff integrity | **Merged** → `28cbcc9e` (supersedes the earlier **177** watchlist-only plan) |
| **174** | Monday live scanner acceptance | **PR #174 OPEN** — pre-session docs; complete ET-window evidence on **2026-10-26** |
| **175** | Continuation & inbox acceptance | **Pending** — after Batch 174 Monday sign-off |
| **176** | Catalyst intel distribution bridge V1 | **Merged** — PR **#175** → **`788b1b93`**; activation still gated (**ISS-006**) |
| **177** | Lovable forward-sync & continuity | **Merged / ops** — PR **#176** → **`1002c682`**; integration branch may forward-sync normally |
| **178** | Post-Monday scanner follow-up | **Pending** — depends on Batch **174** findings |
| **179** | Public website & conversion V1 | **Merged** — PR **#177** → **`dc42cfe5`**; Vercel SUCCESS |
| **180** | Public navigation & UX integrity V1 | **In progress** — PR open from `cursor/batch180-public-nav-ux-v1` |
| **181** | — | **Pending** (not scheduled in git) |

**Ops gate (parallel):** **ISS-015** — Lovable **`chat`-only** Edge deploy when previous revision id is recoverable (`docs/release/edge-function-release-lovable.md`). **Blocked.**

Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md`. npm/deploy findings: ISS-016 through ISS-019.
