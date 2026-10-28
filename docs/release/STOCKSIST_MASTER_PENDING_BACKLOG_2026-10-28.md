# Stocksist — Master pending backlog (2026-10-28)

**Authority:** Owner-approved master roadmap V4. Replaces the active implementation queue in `docs/release/next-approved-batches.md` for batches **190+**. Historical batches **171–189** remain in `docs/CHANGELOG.md` and prior runbooks — do not reassign.

**GitHub `main` baseline:** `1398d16ad0041c34661e4bc76487c5a3757c207e` (PR **#194** merged).  
**Lovable integration branch:** `cursor/lovable-sync-from-main-20261024` @ **`04da6d7f87994c93a0c5fc64492654df2424fe0b`** (forward-sync includes PR #194; preserves `bun.lock`, Lovable `deno.lock`, generated `supabase/functions/mcp/index.ts`, and `handler_test.ts` typing).

**Immediate P0 engineering priority:** **ISS-034** — full-universe `sync-screener-data` still exceeds Edge CPU budget after PR #194 mitigation deploy; last confirmed DB publication **2026-10-28 16:15:04 UTC** (108 rows).

---

## Execution order — authorized development batches

| Batch | Name | Type | Precondition / notes |
| --- | --- | --- | --- |
| **190** | CPU-safe scanner execution and atomic publication | **Implementation** | **Next authorized development assignment.** Fit synchronous full-universe work within Supabase Edge CPU limits without dropping tabs, universe, D1 volume semantics, volume-first sort, or publication evidence. May require architectural split if single-request model cannot comply. Runbook seed: `docs/release/p0-screener-cpu-publication-v1.md`. **Do not start inside the Master Continuity Sync V4 docs PR.** |
| **191** | Live scanner session acceptance | **Verification** | Batch **174** matrix and extended-session integrity — timed premarket / RTH / after-hours evidence; not a reimplementation of Batches 178/185. |
| **192** | AM Inbox continuation acceptance | **Verification** | Batch **175** / **186** — RPC persistence already **PASS** (Oct 27: 3,131 rows); authenticated UI **NOT VERIFIED**. |
| **193** | Mobile dashboard and Journal acceptance | **Verification** | Batch **188** merged in git; Android Journal, Risk, Carryover, AI Brief — **NOT VERIFIED**. |
| **194** | Earnings Edge activation and verification | **Ops + verification** | Batch **187** merged on `main`; Vercel **SUCCESS**; Edge functions (`get-pre-market-workspace`, `sync-earnings-finnhub`, `sync-catalyst-events`) activation **NOT APPLIED** — revision ids **UNKNOWN**. |
| **195** | Catalyst attribution verification | **Verification** | Batch **181** guards in git; production TSLA/SpaceX-style mislabels **NOT RE-VERIFIED** (**ISS-028**). No broad DB rewrite without approved plan. |
| **196** | Fly Radar, Five Pillars and continuation verification | **Verification** | Fly worker v45 parity previously **PASS** (2026-10-24); Five Pillars transparency (Batch **182**); continuation handoff vs homepage movers — explain different universes. |
| **197** | Desktop Radar historical and workflow cleanup | **Implementation (bounded)** | **DESK-01** — History loading / duplicate AI Analyst only if reproduced on current build; do not reopen Batch **183** globally. |
| **198** | Targeted market-data and operational reliability | **Implementation (bounded)** | Quota/cache sufficiency, watchdog recovery, npm advisories remainder (**ISS-016**), middleware deprecation (**ISS-018**) — scoped fixes only. |
| **199** | Penny Continuation specification | **Design** | Distinct from **`penny`** price-band panel; thresholds and eligibility **unapproved** until spec lands. |
| **200** | Penny Continuation implementation | **Implementation** | **Blocked** until Batch **199** approved. |
| **201** | Historical intelligence and momentum refinements | **Product** | Post-core-launch enhancements; not before **190–198** acceptance gates. |
| **202** | Final launch stabilization | **Release** | Cross-surface acceptance, disclosure review, integrity pass; no new major surfaces. |

---

## Deferred and conditional — batches 203–209

These are **not** the active implementation queue unless owner promotes an item.

| Batch | Name | Condition |
| --- | --- | --- |
| **203** | **`chat` Edge deploy (ISS-015)** | Lovable **`chat`-only** deploy from approved source; previous production revision id for rollback **UNKNOWN** — blocked until recoverable. |
| **204** | Catalyst distribution activation (**ISS-006**) | Source bridge on `main` (Batch **176**); requires approved server entry point, migrations, registry flags, staged Lovable activation — not a SEC Gate I rerun. |
| **205** | Real-time feed upgrades (**ISS-008**) | Product deferred. |
| **206** | AI Trader product (**ISS-009**) | Operating mode **OFF**; homepage promotion removed (Batch **189**). |
| **207** | Broker integration (**ISS-010**) | Not approved. |
| **208** | Billing and payments go-live (**ISS-011**) | Stripe state not checked this cycle. |
| **209** | Conditional platform and launch hygiene | Community/waitlist (**ISS-013**), sitemap omissions (**ISS-014**), full accessibility/security launch review, optional Lovable `deno.lock` parity with frozen CI — **owner promotes** individual items. |

---

## Finished in git — do not reopen as development

- **171–173, 176–189** — see `docs/CHANGELOG.md`.
- **PR #193** (P0 D1 extended-hours screener volume) — merged **`4f7c10db`**, **deployed Lovable** (fingerprint `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`). **Premarket live acceptance pending** — not production sign-off.
- **PR #194** (CPU mitigation) — merged **`1398d16a`**, **deployed Lovable** **2026-10-28 17:29:52 UTC** (owner-reported). **Not production acceptance:** **17:30** and **17:35 UTC** scheduled runs still **CPU Time exceeded**; ISS-034 **open**.

---

## Guardrails

- GitHub merge ≠ Vercel deploy ≠ Lovable Edge deploy ≠ Fly image update.
- Production Supabase operations through **Lovable Cloud** (project `zcjptaolpumhtlwhlemq`).
- Do not merge `cursor/chat-single-pass-v1`. Forward-sync integration branch from `main`; preserve Lovable-only lockfiles and generated MCP bundle.
- Each implementation batch: focused tests, typecheck, build, explicit owner approval before merge/deploy.
