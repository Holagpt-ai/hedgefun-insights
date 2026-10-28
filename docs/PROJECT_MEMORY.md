# Project memory

Canonical constraints for Stocksist. Batch runbooks under `docs/` stay the detailed history. This file is the short version agents must keep true.

**Baseline (2026-10-28, Master Continuity Sync V4):** GitHub `origin/main` **`1398d16ad0041c34661e4bc76487c5a3757c207e`** (PR **#194** merged). Lovable integration **`cursor/lovable-sync-from-main-20261024`** @ **`04da6d7f87994c93a0c5fc64492654df2424fe0b`**.

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

Route production Supabase operations through **Lovable Cloud first**. Do not instruct the user to create or use a separate Supabase account or obtain a personal **`SUPABASE_ACCESS_TOKEN`** by default. If Lovable lacks a needed management capability, report the exact limitation instead of assuming direct Supabase dashboard or CLI access.

Merging to `main` updates git only. Production Supabase state changes when Lovable Cloud (or an explicitly approved ops path) deploys or applies work from `main`.

## Source of truth

- GitHub `main` is the authoritative **application** source. Lovable preview hosts are not a second production line.
- **Active Lovable integration branch:** `cursor/lovable-sync-from-main-20261024`. Tip **`04da6d7f`** (forward-sync with `main` **`1398d16a`**). After each `main` merge, **forward-sync** the integration branch from `main` without merging the whole integration branch into `main`. Preserve Lovable-only **`bun.lock`**, Lovable **`deno.lock`**, generated **`supabase/functions/mcp/index.ts`**, and **`sync-screener-data/handler_test.ts`** typing fixes. Do not merge `cursor/chat-single-pass-v1`.
- Archived recovery branch: `cursor/chat-single-pass-v1`. Port analyst catalyst files from it only when explicitly assigned; do not merge the branch.

## Master roadmap (2026-10-28)

- **Active implementation register:** `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md` (batches **190–209**).
- **Next authorized development batch:** **190** — CPU-safe scanner execution and atomic publication (**ISS-034**). Not started until owner assigns implementation after continuity merge.
- **Historical product batches 171–189:** complete in git or verification-only; see `docs/CHANGELOG.md`. Do not reissue implementation.
- **Batch 174 / 175:** unfinished **verification** (live scanner matrix; AM Inbox UI), not new feature development — tracked under batches **191–192** in the master backlog.

## Recovered analyst catalyst evidence

Ported from `cursor/chat-single-pass-v1` onto current `main` by cherry-pick, then tightened so a wrong ticker, a stale event, or a missing source cannot become a confirmed catalyst.

| Source commit | Subject |
| --- | --- |
| `68c88114` | feat(ai-analyst): catalyst evidence depth v2 for CURRENT_CATALYST |
| `2f22387b` | fix(chat): prioritize catalyst evidence in bounded analyst intelligence delivery |
| `ed75aa71` | fix(ai-analyst): improve catalyst source recovery and financial fact extraction |

Decisions kept with the port:

- Client modules in `src/lib/ai-analyst/` and the Deno copies in `supabase/functions/_shared/ai-analyst/` stay separate. Change both when the evidence rules change.
- `supabase/functions/chat/analyst-intelligence-delivery.ts` bounds the chat packet at 4500 characters.
- Production **`chat`** deploy remains blocked (**ISS-015**) until Lovable rollback revision is known.

Do not restore that branch's copy of `supabase/functions/mcp/index.ts`. Generated bundle stays generator-owned.

## Data and deploy ownership

- Production schema history is `supabase/migrations/`. **Apply** migrations through Lovable Cloud, not ad hoc Cursor CLI against production.
- Vercel production follows GitHub `main` via the normal Vercel Git integration.
- Edge Function **source** lives in git; **production deploy** is Lovable Cloud unless a batch explicitly assigns another executor.
- Never delete or rewrite an applied Supabase migration. Add a corrective migration.

## Deferred until owner promotes (batches 203–209)

See master backlog. Summary: real-time feed (**ISS-008**), AI Trader (**ISS-009**), broker (**ISS-010**), billing (**ISS-011**), SEC schedule edits (**ISS-012**), **`chat`** deploy (**ISS-015**), catalyst distribution activation (**ISS-006**).

## Catalyst attribution (client, Batch 181)

Persisted `attribution_class` on stored rows is not trusted over live headline evidence for generic news providers. SEC / earnings calendar / company IR rows keep authoritative persisted classes.

## Five Pillars presentation (client, Batch 182)

Qualification UI must not invent RVOL, baselines, or timestamps. Use `buildFivePillarsTransparencyView()` and canonical `RadarRankedRow` scanner fields.

## How to avoid another full audit

Each session reads this file, `docs/SESSION_HANDOFF.md`, and `docs/ISSUE_REGISTER.md`. Update those when a decision, defect, or deploy fact changes. `npm run integrity` covers navigation, sitemap/canonical agreement, brand hosts, MCP artifact agreement, and `origin/main` divergence.

## Scanner volume contract (movers + sync)

- Polygon snapshot `day.v=0` means **volume unavailable**, not verified zero session liquidity.
- **D1 (PR #193):** extended-session screener qualification uses observation-session volume via `sessionQualificationVolume()` — merged and **deployed Lovable** (fingerprint `23980c31…`). **Premarket live acceptance pending.**
- **CPU mitigation (PR #194):** per-sync session-volume cache, single-pass main tab selection, fused evidence scan — merged and **deployed Lovable 2026-10-28 17:29:52 UTC** (owner-reported). **ISS-034 remains open** — 17:30 / 17:35 UTC runs still **CPU Time exceeded**; last confirmed publication **16:15:04 UTC**, 108 rows.
- Public `/markets/premarket` extended volume rules unchanged from Batch **178**.

## Scanner tab evaluation evidence (Batch 185)

- Authenticated Screeners tabs require persisted **`tab_evaluation_evidence`**. Client may attach **`publication_confirmed`** when evidence null — not a substitute for provider evaluation.
- Do not treat homepage **Market Pulse / Polygon snapshot movers** as Radar or Five Pillars qualification.
- Extended-session **Gappers** may restore from verified Radar prior-close overlay when sync evidence is missing.

## Lovable preview Edge type parity

- `get-pre-market-workspace`: catalyst row `facts` typed as `Record<string, unknown> | null`.
- `radar-historical-context`: `resolveSecurityId` accepts `ReturnType<typeof createClient<any>>`. Keep in sync on forward-sync.

## Homepage market presentation (Batch 189)

- Public homepage does **not** promote AI Trader.
- `HOME_MARKET_CLOCK_EXCHANGES` fixed seven-city order; session line uses `composeMoversSessionLine()` with 1s tick.

## Evidence labels

- **Confirmed** — checked against `main` or a command run in that session
- **Reported** — stated in an older runbook or owner handoff and not rechecked in Cursor
- **Deferred** — intentionally out of scope
