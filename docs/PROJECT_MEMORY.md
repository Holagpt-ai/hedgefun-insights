# Project memory

Canonical constraints for Stocksist. Batch runbooks under `docs/` stay the detailed history. This file is the short version agents must keep true.

## Current operating baseline — 2026-10-28

**GitHub `main`:** `1398d16ad0041c34661e4bc76487c5a3757c207e` (PR **#194** merged).  
**Lovable integration:** `cursor/lovable-sync-from-main-20261024` @ `04da6d7f87994c93a0c5fc64492654df2424fe0b`.

**Lovable Cloud `sync-screener-data`:** PR **#194** deployed **2026-10-28 17:29:52 UTC**. Submitted source SHA-256 `cfd9032b5d8c724bea5889a0e9888395219e0815626c2895bf1cdc705a2cc3af`; **37-file runtime closure** SHA-256 `c3a70628e6af107d10c73026b79e21850bf21f2b03427e700c859cdfcdb8a167` (**do not conflate**). Edge revision number **not reported**. **17:30 / 17:35 UTC** **CPU Time exceeded** — no fresh publish. Last verified persisted generation **16:15:04 UTC**, **108** rows (`sync_run_id` `d3b3cd1b-42de-4c93-8170-9fd036c41f4e`).

**PR #193 D1:** merged `4f7c10db`; deployed fingerprint `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`. Timed premarket acceptance **pending**.

**ISS-034 P0** is the immediate blocker — **Batch 190** (CPU-safe publisher architecture). Source merges and production activation are independent. Master register: `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md`.

AI Trader, billing, brokers, feed upgrades, and AI Analyst/`chat` regression cleanup remain **deferred** (batches **203–209**).

## Product

- Public name, domain, and canonical origin: Stocksist, `stocksist.com`, `https://stocksist.com`.
- Repository and several internal ids still say Hedgefun (`hedgefun-insights`, MCP server id `hedgefun-mcp`). Those ids are not the public brand.
- Legacy hostname redirects are declared in `vercel.json`. Do not advertise that host as a canonical origin.
- Lovable preview hosts are not production. `src/integrations/supabase/previewAuthStorage.ts` may list them for preview auth only.

## Platform ownership

**Supabase is managed within Lovable Cloud.** Project id: `zcjptaolpumhtlwhlemq`.

| Surface | Owner | Role |
| --- | --- | --- |
| Application source | **GitHub `main`** | Authoritative code, migrations in git, Edge Function source, tests, PRs |
| Supabase production | **Lovable Cloud** | Managed Postgres, Auth, Edge deploy execution, migration apply, secrets, logs, backend configuration |
| Public web | **Vercel** | `https://stocksist.com` SPA hosting |
| Backend implementation | **Cursor** (in repo) | Write and review `supabase/migrations/`, `supabase/functions/`, shared modules, and tests; merge to `main` |

Route production Supabase operations through **Lovable Cloud first**. Do not instruct the user to create or use a separate Supabase account or obtain a personal **`SUPABASE_ACCESS_TOKEN`** by default.

Merging to `main` updates git only. Production Supabase state changes when Lovable Cloud deploys or applies work from `main`.

## Source of truth

- GitHub `main` is the authoritative **application** source.
- **Active Lovable integration branch:** `cursor/lovable-sync-from-main-20261024` @ **`04da6d7f`**. Forward-sync from `main`; preserve Lovable-only **`bun.lock`**, Lovable **`deno.lock`**, generated **`supabase/functions/mcp/index.ts`**, **`sync-screener-data/handler_test.ts`** typing. Do not merge `cursor/chat-single-pass-v1`.
- Archived recovery branch: `cursor/chat-single-pass-v1` — analyst port source only when assigned.

## Master roadmap (2026-10-28)

- **Active register:** `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md` (batches **190–209**).
- **Next authorized implementation:** **Batch 190** only (owner scope approval).
- **Historical batches 171–189:** complete in git; acceptance gates under **191–198** — not reimplementation.
- **Batch 174 / 175:** unfinished **verification** (batches **191–192**).

## Recovered analyst catalyst evidence

Ported from `cursor/chat-single-pass-v1` with tightened attribution rules. Client `src/lib/ai-analyst/` and Deno copies stay in sync. Production **`chat`** deploy blocked (**ISS-015**, batch **204**).

Do not restore archived branch `mcp/index.ts`. Generated bundle stays generator-owned.

## Data and deploy ownership

- Apply migrations through Lovable Cloud. Never delete or rewrite an applied Supabase migration.
- Vercel follows GitHub `main` via Git integration.

## Deferred until owner promotes (batches 203–209)

| Batch | Topic |
| --- | --- |
| **203** | Catalyst distribution activation (**ISS-006**) |
| **204** | AI Analyst / `chat` Edge (**ISS-007**, **ISS-015**) |
| **205** | Real-time feed (**ISS-008**) |
| **206** | Newsletter / billing |
| **207** | Broker (**ISS-010**) |
| **208** | AI Trader (**ISS-009**) |
| **209** | Community / parked ideas (**ISS-013**) |

## Catalyst attribution (Batch 181)

Persisted `attribution_class` is not trusted over live headline evidence for generic news providers.

## Five Pillars (Batch 182)

Use `buildFivePillarsTransparencyView()`; do not invent RVOL or baselines in UI.

## Session start

Read this file, `docs/SESSION_HANDOFF.md`, and `docs/ISSUE_REGISTER.md`. Run `npm run integrity` after navigation/SEO/MCP edits.

## Scanner volume and publication

- Polygon `day.v=0` = missing volume, not verified zero liquidity.
- **D1:** observation-session qualification volume — deployed; acceptance pending.
- **CPU mitigation (#194):** cache + fused passes — deployed; **publication still blocked (ISS-034)**.
- Tab evaluation evidence (Batch **185**): persisted `tab_evaluation_evidence`; homepage movers ≠ scanner qualification.

## Homepage (Batch 189)

No AI Trader promotion on homepage; market clocks and session line per `composeMoversSessionLine()`.

## Evidence labels

**Confirmed** · **Reported** · **Deferred**
