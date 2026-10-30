# Project memory

Canonical constraints for Stocksist. Batch runbooks under `docs/` stay the detailed history. This file is the short version agents must keep true.

## Current operating baseline — 2026-10-30 after Batch 190.8 Edge release

**GitHub `main`:** `b720106771950b7ed90c81d53f3ce2f196e35c49` (Batch 190.8 PR #201 squash-merged). **Lovable integration/editor:** `f8e2fda698c473519d4ddb40f06f04ad6f13c4d6`; source aligned. Preserve Lovable-specific generated files and migrations.

**Lovable Cloud `sync-screener-data`:** Batch 190.8 PR #201 merged into GitHub main b720106771950b7ed90c81d53f3ce2f196e35c49; Lovable forward-sync f8e2fda698c473519d4ddb40f06f04ad6f13c4d6. Owner authorized Git-snapshot-only rollback exception (exact previous Edge revision unavailable). Lovable Cloud reported one successful sync-screener-data-only Edge deployment 2026-10-30 23:54:35–23:54:46 UTC, submitted source SHA-256 7bf8c45d9c26ff021693624f21f878e90c3193d4f16dbb92fd59123ae39c32d6; deployed revision ID unavailable. Rollback source: last approved Batch 190.7 Lovable integration commit 2691424bbfa89b4da9a3ca9a832c007606b5a582, requiring a new source deploy to restore (not exact binary). Read-only 23:55:40 UTC: cron 25 still active */5; old 23:45 job still finalizing with build_rows:internal_error, 23:55 cron DO not a new publish; current six-tab feed unchanged at 20:10:02 UTC / 108 rows / one run / zero duplicate symbols or missing provider timestamps. Gate 4 = PENDING 0/3 new naturally scheduled publications. ISS-034 remains P0 OPEN; no migrations/cron/secrets/frontend/other Edge touched.

**PR #193 D1:** merged `4f7c10db`; deployed fingerprint `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`. Timed premarket acceptance **pending**.

**ISS-034 P0** remains OPEN. The Day Trade Radar observation-session mismatch was locally reproduced and corrected in Batch 190.8; the corrected Edge was deployed, but recovery is NOT yet production-verified. Gate 4 PENDING 0/3 fresh naturally scheduled atomic six-tab publications. Do not close before acceptance.

Deferred product/platform work is batched **203–209** in the master register (not active implementation).

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

Merging to `main` updates git only. Production Supabase state changes when Lovable Cloud (or an explicitly approved ops path) deploys or applies work from `main`. Never publish the production frontend through Lovable; Vercel deploys from GitHub.

## Source of truth

- GitHub `main` is the authoritative **application** source. Lovable preview hosts are not a second production line.
- **Active Lovable integration branch:** `cursor/lovable-sync-from-main-20261024` @ **`2691424b`** (Batch 190.7, before Batch 190.8 review). After each `main` merge, **forward-sync** the integration branch from `main` without merging the whole integration branch into `main`. Do not merge `cursor/chat-single-pass-v1`.
- **Archived recovery branch:** `cursor/chat-single-pass-v1`. Source of analyst commits below; large divergence is historical — not current Lovable sync state. Do not merge it.
- `origin/cursor/catalyst-evidence-depth-v2` (`c3bb034a`) is a narrower parallel of the same analyst work. Recovery used archived-branch versions.

## Master roadmap (2026-10-28)

- **Active register:** `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md` (batches **190–209**).
- **Current approved Git-only work:** Batch **190.8** draft PR **#201**; no merge or production deployment authorization.
- **Historical batches 171–189:** complete in git; open work is **acceptance/ops** under **191–198**, not reimplementation.
- **Batch 174 / 175:** unfinished **verification** (batches **191–192**). PR **#174** closed without merge.

## Recovered analyst catalyst evidence

Ported from `cursor/chat-single-pass-v1` onto current `main` by cherry-pick, then tightened so a wrong ticker, a stale event, or a missing source cannot become a confirmed catalyst.

| Source commit | Subject |
| --- | --- |
| `68c88114` | feat(ai-analyst): catalyst evidence depth v2 for CURRENT_CATALYST |
| `2f22387b` | fix(chat): prioritize catalyst evidence in bounded analyst intelligence delivery |
| `ed75aa71` | fix(ai-analyst): improve catalyst source recovery and financial fact extraction |

Decisions kept with the port:

- Client modules in `src/lib/ai-analyst/` and the Deno copies in `supabase/functions/_shared/ai-analyst/` stay separate. Change both when the evidence rules change.
- `supabase/functions/chat/analyst-intelligence-delivery.ts` bounds the chat packet at 4500 characters. Priority facts need a source URL and a statement. Lower-priority rows shrink first. If even the minimal packet exceeds the budget, chat omits the intelligence block.
- An official or ticker-specific web hit must name the asked symbol or its known company in the title, snippet, or a non-SEC host. A `sec.gov` URL counts only when the title or snippet names that symbol or company.
- Events older than 45 days versus the date named in the question, or the radar trading date when the question names none, are historical context. They are not the current primary.
- Known company names used for that match are Marvell, NVIDIA, Apple, Tesla, and AMD, plus host and title text.
- Scanner ranking, database schema, the MCP bundle, and SEC ingestion were not changed.

Remaining limits:

- This change does not deploy `chat`. Production chat keeps the previously deployed function until an approved Edge deploy (**ISS-015**, master batch **204**).
- Dollar figures are extracted only from explicit text near a fiscal-year token. Headline-only evidence is not verified guidance.
- The prompt tells the model the packet is not a live quote or a real-time feed.

Do not restore that branch's copy of `supabase/functions/mcp/index.ts`. PR #162 on `main` is the canonical generated bundle.

## Data and deploy ownership

- Production schema history is `supabase/migrations/`. **Apply** migrations through Lovable Cloud (managed Supabase), not by ad hoc Cursor CLI against production. `drizzle/migrations/` is a mirror, not a second production log. See `docs/migration-drizzle-supabase-notes.md`.
- Vercel production follows GitHub `main` via the normal Vercel Git integration. Fly workers, SEC cron, and non-Supabase infra move only in an approved ops step.
- Edge Function **source** lives in git; **production deploy** of those functions is a Lovable Cloud responsibility unless a batch explicitly assigns another approved executor.
- Never delete or rewrite an applied Supabase migration. Add a corrective migration.
- Generated MCP output stays generator-owned (`scripts/mcp-edge-validate.mjs`). Do not hand-edit `supabase/functions/mcp/index.ts` except via the emitter on the Lovable integration branch workflow.

## Deferred until a later approved batch

Product and platform items below remain deferred; master batches **203–209** own sequencing detail.

- Real-time feed upgrades (**ISS-008**, batch **205**)
- AI Trader product work (`AI_TRADER_CURRENT_OPERATING_MODE` is `OFF`; batch **208**)
- Broker integration (**ISS-010**, batch **207**)
- Billing go-live (**ISS-011**, batch **206**)
- Further SEC schedule, write-gate, or function changes. **Gate I.3 activation already happened** (see `docs/DEPLOYMENT_STATUS.md`). `docs/sec-edgar/unapplied-cron.sql` is a leftover draft, not the live schedule. **Do not rerun** Gate I.3 activation or rewrite applied migration history.
- Catalyst source enablement / distribution activation (**ISS-006**, batch **203** — `docs/catalyst-intelligence/batch34-catalyst-activation-sequence.md`)
- AI Analyst / `chat` Edge regression cleanup (**ISS-007**, **ISS-015**, batch **204**)

## Catalyst attribution (client, Batch 181)

Persisted `attribution_class` on stored rows is not trusted over live headline evidence for generic news providers. SEC / earnings calendar / company IR rows keep authoritative persisted classes. Cross-surface copy uses `catalyst-attribution-presentation.ts`; do not imply price causation without evidence.

## Five Pillars presentation (client, Batch 182)

Qualification UI must not invent RVOL, baselines, or timestamps. Use `buildFivePillarsTransparencyView()` and canonical `RadarRankedRow` scanner fields; grace and expired lifecycle come from `day_trade_qualification_state`. A historical pass must not read as a current pass in lifecycle copy.

## How to avoid another full audit

Each session reads this file, `docs/SESSION_HANDOFF.md`, and `docs/ISSUE_REGISTER.md`. Update those when a decision, defect, or deploy fact changes. `npm run integrity` covers navigation, sitemap/canonical agreement, brand hosts, MCP artifact agreement, and `origin/main` divergence. It does not replace an ops query of Vercel, Supabase, or Fly.

## Screener session volume (P0 D1) and CPU publication

- Edge qualification uses `sessionQualificationVolume()` in `supabase/functions/_shared/screeners/session-volume.ts`.
- Premarket: positive `min.av` only. Regular: positive `day.v`. After-hours: incremental vs same-snapshot `day.v` baseline when verifiable.
- Do not treat Polygon `day.v=0` as verified zero liquidity during extended sync.
- **PR #194:** per-sync bound session-volume cache and reduced redundant full-universe passes — **deployed**; **ISS-034** publication still blocked (see baseline above).

## Scanner volume contract (movers)

- Polygon snapshot `day.v=0` means **volume unavailable**, not verified zero session liquidity (`polygonSnapshotVolume` in `src/lib/markets/movers-integrity.ts`).
- Verified zero from cache/RPC still ranks **before** unknown volume in volume-first lists.
- Live regular-session acceptance is documented in `docs/release/scanner-live-market-acceptance-v1.md`; do not claim RTH acceptance from weekend or replay-only checks.
- Public `/markets/premarket` may use the same provider snapshot as gainers and losers, but a row with a timestamp is premarket only when that timestamp is inside 4:00–9:30 a.m. ET. Afternoon regular-session prints stay on the regular tabs. Extended volume comes from minute accumulation; missing volume stays blank. The public mover table does not invent RVOL or catalyst.

## Scanner tab evaluation evidence (Batch 185)

- Authenticated Screeners tabs require persisted **`tab_evaluation_evidence`** on `screener_feed_state`. When null, client may attach **`publication_confirmed`** evidence (published row counts only) — not a substitute for provider universe evaluation or verified zero-match claims.
- Do not treat homepage **Market Pulse / Polygon snapshot movers** as Radar or Five Pillars qualification.
- Extended-session **Gappers** may restore from verified Radar prior-close overlay via `restoreExtendedSessionGappers` when sync evidence is missing or `prerequisite_unavailable`; do not fabricate opening prints or gap percentages.
- **Lovable Oct 27 read-only:** screener feed **115 rows**, six tabs evaluated, **5-arg RPC** + evidence **PASS**; AM handoff list **3,131** rows for `2026-10-27` **PASS**. Migration ledger / Edge revision id **UNKNOWN** (not failed). No screener migration or Edge redeploy required from those checks alone.
- **AM Inbox continuation:** `resolveAmInboxSessionDate` decouples handoff RPC from workspace `et_date`; server builds disable sessionStorage mirror (Batch 184).

## Lovable preview Edge type parity

- `get-pre-market-workspace`: catalyst row `facts` typed as `Record<string, unknown> | null` (Lovable preview typecheck).
- `radar-historical-context`: `resolveSecurityId` accepts `ReturnType<typeof createClient<any>>`. Type-only; keep in sync with integration branch on forward-sync.

## Homepage market presentation (Batch 189)

- Public homepage does **not** promote AI Trader; the feature route remains for deferred product work.
- `HOME_MARKET_CLOCK_EXCHANGES` is a fixed seven-city order (New York first); local-time card is **last**; mobile shows a horizontal scroll hint.
- Market Pulse session line uses `composeMoversSessionLine()` with a 1s wall-clock tick (not movers `fetchedAtMs`). Provider observation timestamps stay on fetch time. Stock detail headers keep `formatStockHeaderSessionLine()`.

## Evidence labels

Use these words in handoffs and the issue register:

- **Confirmed** — checked against `main` or a command run in that session
- **Reported** — stated in an older runbook or checklist and not rechecked
- **Deferred** — intentionally out of scope

## Historical continuity snapshots (superseded baselines)

Older top-of-file baselines and master-reset paragraphs referenced SHAs such as `03449198`, `d86e0c69`, `a03407c2`, and pre–Oct 28 handoff states. **Do not use those for current production decisions.** Detailed triage history: `docs/release/master-reset-2026-10-27.md`. Batch **171–189** completion map: `docs/CHANGELOG.md` and `docs/release/next-approved-batches.md`.
