# Stocksist — Master pending work register and batch roadmap

**Approved:** October 28, 2026 (ET) — Master Continuity Sync V4 (PR **#195**).  
**Scope:** `Holagpt-ai/hedgefun-insights` / Stocksist.com only.  
**Canonical link:** `docs/PROJECT_MEMORY.md`, `docs/SESSION_HANDOFF.md`, `docs/ISSUE_REGISTER.md`.

This register replaces the **active implementation queue** in `docs/release/next-approved-batches.md` for batches **190+**. Historical batches **171–189** stay in `docs/CHANGELOG.md` and named runbooks — **do not reissue**.

## 1. Verified baseline

| Surface | Latest confirmed evidence | Implication |
| --- | --- | --- |
| GitHub `main` | `1398d16ad0041c34661e4bc76487c5a3757c207e` — PR **#194** merged | Approved app source contains D1 and CPU optimization. |
| Lovable integration | `cursor/lovable-sync-from-main-20261024` @ `04da6d7f87994c93a0c5fc64492654df2424fe0b` | Separate branch; approved `main` plus protected Lovable-only `bun.lock`, `deno.lock`, `mcp/index.ts`, `handler_test.ts`. **Do not switch or reconnect.** |
| Lovable Cloud project | `zcjptaolpumhtlwhlemq` | Production Supabase, database, auth, Edge Functions, logs. |
| Production `sync-screener-data` | PR **#194** deployed **2026-10-28 17:29:52 UTC**. Submitted source SHA-256 `cfd9032b5d8c724bea5889a0e9888395219e0815626c2895bf1cdc705a2cc3af`; **37-file runtime closure** SHA-256 `c3a70628e6af107d10c73026b79e21850bf21f2b03427e700c859cdfcdb8a167`. Edge **revision number not reported**. | **Deployment succeeded; publication failed.** Not scanner acceptance. |
| Post-PR #194 runtime | **17:30** and **17:35 UTC:** 13,262 evaluated; 10 / 9 qualified; **CPU Time exceeded** (~5–6s after boot), before atomic publication. | **ISS-034 P0** still blocks live scanner freshness. Prefer bounded split/offload architecture over micro-optimization loops. |
| Latest DB publication | `screener_feed_state.synced_at = 2026-10-28 16:15:04.456 UTC`; `sync_run_id = d3b3cd1b-42de-4c93-8170-9fd036c41f4e`; **108** rows. | Stale generation; cron job **25** firing every 5 minutes does **not** prove Edge publish completed. |
| D1 / ISS-033 | PR **#193** → `4f7c10db`; deployed fingerprint `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`. | D1 supported by processing evidence; **timed premarket acceptance pending**. |
| Oct 29 premarket | **08:00–09:15 ET** planned observation — **not completed** in evidence. | Cannot count as PASS; rescope if CPU publish still broken. |

**Separation:** D1 volume correction **deployed**; PR #194 mitigation **deployed**; scanner **publication blocked** — all three can be true.

## 2. Execution policy

- **P0 first:** full-universe processing and one atomic six-tab publication before new scanner features.
- Preserve ~13,262 eligible universe (or actual provider universe), six tabs, volume-first global ranking, Five Pillars, D1 observation-session semantics, delayed-data honesty, and eligibility conditions.
- **Do not redo merged batches 171–189** or PRs **#193/#194** as implementation; acceptance gates remain open where noted.
- GitHub `main` = code truth; Vercel, Lovable Edge/database, and Fly = distinct surfaces.
- No merge/deploy/migration/cron/secrets/Fly without explicit batch approval.

## 3. Master batch execution order

### Phase A — production recovery

#### Batch 190 — P0 CPU-safe screener execution and atomic publisher

**Priority:** P0 · **Status:** **FIRST ACTIVE IMPLEMENTATION CANDIDATE** (owner scope approval required).  
**Evidence:** ISS-034; PR #194 ~5× local speedup still exceeded Edge CPU at 17:30/17:35.

**Work:** Bounded CPU-compliant plan — ideally separate full-universe evaluation from the ~2s Edge request (chunked/idempotent jobs, approved worker, or measured alternative). Preserve one observation context, six tabs, global volume-first ranking, evaluation evidence, NHL baselines, session volume, diagnostics, and **single atomic `replace_screener_results_generation_v1`**. Job leases, idempotency, cron overlap, metrics, rollback. For new architecture, prefer verified **#194** or **D1** reference; **do not default** to pre-D1 `68092518` (reintroduces ISS-033 and did not fix CPU). No universe trim that changes global top-20 winners.

**Gate:** Observed full-universe production sync after authorized deploy with new `sync_run_id`, `synced_at`, six-tab rows/evidence, no CPU overrun, D1 intact. **ISS-034 open until verified.**

#### Batch 191 — P0 market-session scanner acceptance (old Batch 174; ISS-033 / ISS-024 / ISS-031)

**Blocked by Batch 190 publisher acceptance.** Timed premarket (04:00–09:30 ET, especially 08:00–09:15), RTH, late/after-hours. D1 `min.av` when `day.v=0`, Gappers/movers, spikes, NHL, Five Pillars, RVOL disclosures, homepage vs authenticated scanner separation. Batch **174** remains **CONDITIONAL** until this closes.

#### Batch 192 — P0 AM Inbox continuation acceptance (old Batches 175/186; ISS-025)

Parallel with **190** only without deploy collision; may use stale data if labeled. Authenticated `/dashboard/pre-market` Late-Session Continuation; RPC persistence PASS exists (Oct 27 **3,131** rows scope — confirm filters before comparing to older 2,056/2,050 counts). **Gate:** screenshots + RPC; no indefinite loading.

### Phase B — verify merged functionality

| Batch | Focus | Priority | Notes |
| --- | --- | --- | --- |
| **193** | Mobile workflow & Journal (184/188; ISS-023/027/030/032) | P1 | Merged code; authenticated Android **pending** |
| **194** | Earnings Edge activation (187; ISS-026) | P1 | `get-pre-market-workspace`, `sync-earnings-finnhub`, `sync-catalyst-events` — **separately gated** |
| **195** | Catalyst/Watchlist issuer trust (181; ISS-028) | P1 | TSLA/SpaceX/ORCL live UI **NOT VERIFIED** |
| **196** | Fly Radar / Five Pillars / late continuation | P1 | After **191** stable publication; D2 Stage-2 cap = **hypothesis** |
| **197** | Desktop Radar historical/workflow (DESK-01) | P2 | Reproduce before fix; preserve Batch **183** |
| **198** | Market-data / ops reliability disposition | P1 conditional | Tie to **190–196**; Batch 12 RVOL test 54/55; `deno.lock` frozen CI note |

### Phase C — selective new capability (after P0 baseline)

| Batch | Focus | Status |
| --- | --- | --- |
| **199** | Penny Continuation V1 **spec only** | P2 — thresholds TBD; not Penny Stocks band |
| **200** | Penny Continuation implementation | **CONDITIONAL** — blocked until **199** |
| **201** | Historical intelligence / momentum refinements | **CONDITIONAL** — after Phase 1 acceptance |
| **202** | Final launch stabilization & tech debt | Pre-launch — ISS-016/017/018/019, cross-surface integrity |

### Phase D — deferred (batches 203–209)

| Batch | Name | Issue / notes |
| --- | --- | --- |
| **203** | Catalyst source distribution activation | **ISS-006** — Batch **176** bridge merged; not SEC Gate I.3 rerun |
| **204** | AI Analyst / Catalyst V2.1 and `chat` Edge cleanup | **ISS-007**, **ISS-015** — no chat deploy without rollback id |
| **205** | Real-time feed activation/upgrade | **ISS-008** — deferred until pre-launch |
| **206** | Newsletter, account, billing foundation | End-stage deferred |
| **207** | Broker connectivity | **ISS-010** — not approved |
| **208** | AI Trader shadow/paper/product | **ISS-009** — mode OFF; last-stage |
| **209** | Community / content / market-alert ideas | **ISS-013** parked — not approved engineering |

## 4. Issue crosswalk (abbreviated)

| Item | Disposition | Owner batch |
| --- | --- | --- |
| **ISS-034** | **P0 OPEN** after deployed #194 | **190** |
| **ISS-033** | Deployed; acceptance **PENDING** | **191** |
| Batch **174** | **CONDITIONAL** | **191** / **196** |
| **ISS-025** | RPC PASS; UI **NOT VERIFIED** | **192** |
| Mobile / Journal | Merged **184/188**; acceptance **PENDING** | **193** |
| **ISS-026** | Edge activation **UNVERIFIED** | **194** |
| **ISS-028** | Live UI **NOT VERIFIED** | **195** |
| **ISS-006** | Deferred | **203** |
| **ISS-015/007** | Deferred | **204** |
| **ISS-008–011** | Deferred | **205–208** |

## 5. Archived completion — do not reissue

Batches **171–189**, PR **#193** (D1 deployed), PR **#194** (merged + deployed; **not** publication fix), PR **#174** closed unmerged. See `docs/CHANGELOG.md`.

## 6. Guardrails

No automatic merge/deploy; Lovable frontend not published via Lovable; live claims need authenticated evidence. **Batch 190** is the only batch recommended for immediate owner-approved implementation scope after docs PR merge.
