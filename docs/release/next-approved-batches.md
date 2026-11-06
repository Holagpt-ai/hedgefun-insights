# Next approved product batches

**November 6 source-sync workstream (Batch 211, proposed/not activated):** GitHub `main` `88de3533`, Lovable integration/editor `3ec5f7cd`. GitHub Actions forward-sync controller is being reviewed as a scoped PR. The workflow is **read-only by default** and must not write to Lovable integration until separate owner activation; no Edge/SQL/Fly/Vercel deploy implied. **ISS-040 OPEN.** Do not let this defer Batch 191 RTH/AH scanner acceptance, Batch 195.1 backend activation or Batch 196 numerical checks.


**Historical register:** batches **171–189** (code-complete in git; open items are **acceptance/ops**, not reimplementation).

**Active queue (2026-11-05):** batches **190–209** in **`docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`**. **Batch 190.15** merged and **reported activated**; immediate P0 is **Batch 191** acceptance (**ISS-034 OPEN**), not new 190 implementation.

Baseline: GitHub `main` **`3c810c4b`**. Product batch ids ≠ GitHub PR numbers.

| Batch | Name | Status |
| --- | --- | --- |
| **171** | Security & performance V2 | **Merged** → `88de0ae8` |
| **172** | Catalyst Source Coverage V1 | **Merged** → `93a3c35d` |
| **173** | Watchlist / historical handoff integrity | **Merged** → `28cbcc9e` |
| **174** | Monday live scanner acceptance | **CONDITIONAL** → master **191**; PR **#174** **closed** |
| **175** | Continuation & inbox acceptance | Persistence **PASS**; UI **NOT VERIFIED** → master **192** |
| **176** | Catalyst intel distribution bridge V1 | **Merged** → `788b1b93`; activation **203** |
| **177** | Lovable forward-sync & continuity | **Merged**; integration tip **`04da6d7f`** |
| **178** | Scanner session integrity V1 | **Merged** → `7c2bf094` |
| **179** | Public website & conversion V1 | **Merged** → `dc42cfe5` |
| **180** | Public navigation & UX integrity V1 | **Merged** → `d4095c86` |
| **181** | Catalyst + Watchlist source integrity V1 | **Merged** → `aae43f98` |
| **182** | Five Pillars qualification transparency V1 | **Merged** → `0542ee10` |
| **183** | Desktop Day Trade Radar workspace tabs V1 | **Merged** → `3ef97ee1` |
| **184** | Mobile navigation stability | **Merged** → `0fa177dd` → master **193** acceptance |
| **185** | Scanner evidence & input reliability | **Merged** → `e662c928` |
| **186** | AM Inbox continuation | **Merged** → `d3cec11f` → master **192** acceptance |
| **187** | Earnings intelligence | **Merged** → `d86e0c69` → master **194** Edge ops |
| **188** | Mobile dashboard & Journal reliability | **Merged** → `dc965d2d` → master **193** acceptance |
| **189** | Homepage final cleanup | **Merged** → `68092518` |

### Proposed master batches 190–209 (summary)

| Batch | Name |
| --- | --- |
| **190** | P0 CPU-safe screener execution and atomic publisher — **190.15 merged/deploy reported**; **ISS-034** acceptance → **191** |
| **191** | P0 market-session scanner acceptance (old **174**) |
| **192** | P0 AM Inbox continuation acceptance (old **175/186**) |
| **193** | Mobile workflow & Journal acceptance |
| **194** | Earnings Edge activation & acceptance |
| **195** | Catalyst/Watchlist issuer-trust acceptance — **code merged** PR **#212**; prod walkthrough **NOT VERIFIED** |
| **196** | Fly Radar / Five Pillars / continuation acceptance |
| **197** | Desktop Radar historical/workflow cleanup |
| **198** | Bounded market-data & ops reliability |
| **199–200** | Penny Continuation spec / implementation (conditional) |
| **201–202** | Historical intelligence refinements / launch stabilization |
| **210** | Unified Release Control V1 — git-only manifests & read-only verification (does not replace **191** / **ISS-034**) |
| **203** | Catalyst distribution activation (**ISS-006**) — **DEFERRED** |
| **204** | AI Analyst & `chat` Edge (**ISS-007/015**) — **DEFERRED** |
| **205** | Real-time feed — **DEFERRED** |
| **206** | Newsletter / billing — **DEFERRED** |
| **207** | Broker — **DEFERRED** |
| **208** | AI Trader — **DEFERRED** |
| **209** | Community / parked — **NOT APPROVED** |

Full scope, dependencies, and gates: **`STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`**.

**Ops:** ISS-015 **`chat`** blocked (batch **204**). Penny Continuation ≠ **`penny`** panel. No PR merge/deploy authorized by this register alone.
