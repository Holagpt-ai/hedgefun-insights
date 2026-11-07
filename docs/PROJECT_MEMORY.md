# Project memory

Canonical constraints for Stocksist. Batch runbooks under `docs/` stay the detailed history. This file is the short version agents must keep true.

## Current source-sync checkpoint — November 6, 2026 (Batch 211 PR under review)

- **GitHub main:** `88de3533da1a8fad64e0664cb810b322ee424719` (Batch 195.1 PR #222 merged). **Lovable integration:** `cursor/lovable-sync-from-main-20261024` @ `3ec5f7cd193ff49d03782781421fcbae3bd4678e`, verified to contain main; Lovable editor reported same integration commit. Later dated sections remain historical snapshots, not the current Git tip.
- **Batch 211:** source-only forward-sync controller proposed in `.github/workflows/lovable-source-forward-sync.yml` and `scripts/lovable-sync/`. Read-only check is default. Automatic writes to the Lovable integration branch **MUST remain disabled** until owner explicitly approves activation of `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true`; no branch writes are authorized by the PR alone. No Edge, Fly, Vercel, migration or production job deployment is implied. Runbook: `docs/release/batch211-lovable-source-forward-sync-v1.md`.
- **Production acceptance remains open:** ISS-028 (Catalyst frontend/backend rollout), ISS-034 and ISS-024 (RTH/AH scanner), ISS-036 (Radar numerical acceptance), ISS-039 (live binary provenance). Git source sync is NOT a production release attestation.


## Operations Control Center (Batch 212, read-only)

- `/admin/operations` observes; it never repairs, replays, deploys, restarts, or activates. Runbook `docs/release/batch212-operations-control-center-v1.md`.
- Missing evidence is **Unknown**, never green. Overall health is driven by scanner publication, provider freshness and the Fly worker first; source sync and provenance are reported separately.
- Source parity (integration contains main) is not runtime identity. Owner-reported versions (e.g. Edge v516) stay Unknown without a platform digest (**ISS-039**).
- Generation job rows, leases and Edge logs are service-role / Lovable Cloud only, so V1 shows them as Unknown. Exposing them needs a separately approved admin-only read RPC; do not add direct table grants.
- **Batch 213** supplies that RPC: `get_ops_scanner_diagnostics_v1`. It is `SECURITY DEFINER`, uses `search_path=''`, checks `has_role(auth.uid(),'admin')` inside the function, grants EXECUTE to `authenticated` only, and returns a redacted, bounded projection (at most 20 jobs and a ±2-week exception calendar). It never returns ticker universes or payload columns. Migration `20261106200000` is **not applied** until the owner approves it in Lovable Cloud (`docs/release/batch213-secure-scanner-diagnostics-v1.md`).
- Only explicit CPU-limit wording counts as confirmed CPU exhaustion; HTTP 546 is an Edge resource limit; generic 500s and wall-clock timeouts are not CPU evidence.

### Admin access (Batch 214)

- `AdminGuard` fails closed and makes the cause visible. No session goes to `/login?next=…`. A signed-in non-admin sees Access Denied with their email and user id. A `has_role` error shows "Could not verify" with retry. Only `has_role` → `true` renders admin pages.
- The `admin` role lives only in `public.user_roles`, and client writes to it are blocked by RLS. No migration grants it. Grant it per user through Lovable Cloud with owner approval, never as a git migration (that would commit user ids). Procedure: `docs/release/batch214-admin-access-states-v1.md`.

## Historical operating baseline — 2026-11-05 (post Batch 190.15 activation)

**GitHub `main`:** `3c810c4bafa36bf547d2235451a7643d9e1f7cbe` (Batch **190.15** PR **#217** merged atop Batch **190.14** / **196.2** continuity). Preserve Lovable-specific generated files and migrations.

**Batch 190.15 (reported production activation):** PR **#217** merged. Lovable Cloud **`sync-screener-data`** Edge deployed **2026-11-04** (dual-read before SQL). SQL source on GitHub: **`supabase/migrations/20261104230000_screener_sync_slim_control_json_v1.sql`**. Lovable Cloud reported apply via **Lovable-native Drizzle** (**ledger idx 68**). **`supabase_migrations.schema_migrations`** has **no** row for `20261104230000` — record only; **do not edit or backfill either ledger** from docs. Reported RPC JSON sizes: full job ~**8.60 MB**; **`control`** **407 bytes**. First natural post-migration generation: **85** rows, six tabs evaluated, **7/7** chunks, publication reported for that run. Coordinated rollback requires a new approved SQL change if Edge is reverted after apply (see `docs/migration-drizzle-supabase-notes.md`).

**Batch 192 (reported production activation):** Vercel frontend + Lovable Cloud **`generate-daily-brief`** Edge deploy recorded for AM Inbox / brief evidence-cutoff scope. **ISS-025** authenticated visual acceptance remains **NOT VERIFIED**.

**Lovable Cloud `sync-screener-data` (historical acceptance):** November 1 deployment/integration source reported as `ccb4055b3f8b84c46fa38529844150c140638705`. November 2 naturally scheduled premarket acceptance reported **PASS** with seven consecutive successful publications (04:00–04:30 ET), no new recorded `http_409` publication failures, and latest publication row counts of 60, 62, and 63. Treat these as acceptance evidence for the covered premarket window only.

**PR #193 D1:** merged `4f7c10db`; deployed fingerprint `23980c312052a4cb5de5be12e3a32b178e1d1fa8104c39f384e02f13845e6f03`. November 2 premarket acceptance for that window is reported PASS.

**ISS-034 P0** remains **OPEN** until Batch **191** regular-session and after-hours acceptance criteria are verified across **repeated** production windows. Do not claim permanent CPU reliability from a single post-**190.15** publication or from premarket-only evidence.

**Nov 4 2026 publication failures (confirmed, preserved):** `sync-screener-data` **v506** finalize **HTTP 546** after 7/7 chunks; stranded **`finalizing`** job / generation **`09346799…`**. **Batch 190.12** SQL and **Batch 190.13** cron `{}` normalization are **already deployed** on Lovable Cloud. Do not reapply either. Never hand-edit the production job row.

Deferred product/platform work is batched **203–209** in the master register (not active implementation). **Batch 210** (Unified Release Control V1) adds **git-only** immutable manifests and read-only verification — see `docs/release/batch210-unified-release-control-v1.md` and **ISS-039**; it does **not** replace Batch **191** acceptance or close **ISS-034**.

### Batch 190.16 production checkpoint (2026-11-06, reported)

Owner-reported Lovable Cloud **`sync-screener-data`** Edge **version 516** and six consecutive successful natural premarket generations (narrow premarket window only). Git-recorded narrative: `docs/release/manifests/batch210.example.190.16.historical.v1.json` → `historical_evidence.production_checkpoint_2026_11_06`. **ISS-034** remains **OPEN** until **Batch 191** regular-session and after-hours acceptance; the Batch 210 verifier keeps **runtime** as **UNKNOWN** without platform-attested digests (**ISS-039**).

### Batch 191.1 — Gappers split-scale evidence (2026-11-06, git)

**Merged:** PR **#221** → `67e3418a` on `main`.

**Confirmed:** Some regular-session runs completed **7/7** staged chunks but skipped publication because Gappers tab evidence degraded to **`prerequisite_unavailable`** (`gap_input_coverage_incomplete`) when the **only** remaining “unresolved” volume-active symbols were **intentionally** ungapped under the existing **`impliesSplitScale`** guard (sub-penny / CA mismatch). That path must not count as missing prior-close inputs.

**Fix:** New counter **`split_scale_suppressed_count`** + helper **`gapSuppressedOnlyBySplitScaleGuard`** — see `docs/release/batch191-1-gappers-split-scale-evidence-v1.md`. **ISS-024** / **ISS-034** remain **OPEN** until Batch **191** session acceptance.

### Session recovery note (unrelated client file)

During a prior session recovery, uncommitted work on `src/lib/screeners/screener-radar-intraday-overlay.ts` was **reverted** to match `main`. That change was **not** tied to Batch 210 / release-control scope in this thread. **Do not restore or modify** that file here without a separate review and task.

## Product

- Public name, domain, and canonical origin: Stocksist, `stocksist.com`, `https://stocksist.com`.
- Repository and several internal ids still say Hedgefun (`hedgefun-insights`, MCP server id `hedgefun-mcp`). Those ids are not the public brand.
- Legacy hostname redirects are declared in `vercel.json`. Do not advertise that host as a canonical origin.
- Lovable preview hosts are not production. `src/integrations/supabase/previewAuthStorage.ts` may list them for preview auth only.

## Screener sync — Edge CPU is a hard constraint

Lovable Cloud runs Supabase Edge Functions; **`sync-screener-data` billed CPU (~2s per invocation) is a hard budget**, not a tuning target. Staged sync (Batch 190) exists because a single monolithic pass at ~13k symbols exceeded that limit before atomic publish (**ISS-034**, HTTP **546**).

**Order of operations:**

1. **Optimize on Edge first** — remove duplicate full-universe scans, reuse chunk accumulators, split finalize stages with enter/exit logs, keep atomic publish + lease/idempotency on Edge (Batch **190.14** and follow-on Edge-only batches).
2. **Prove in production** — stage logs and successful `published` generations; local wall-clock benchmarks are regression hints only, not proof of Edge CPU headroom.
3. **Fly offload only if Edge still cannot reliably finalize** — move **CPU-heavy, pure computation** (selection merge, G/L rank on full snapshot, row/evidence assembly) to **`stocksist-radar-v22-worker`**, which already ships shared `selection.ts` and is not Edge-bound. **Do not migrate Supabase off Lovable**, change Fly machines/scaling, or deploy worker/bridge/Edge changes without an **approved batch**. Edge remains orchestrator: cron/chunks, lease CAS, **`publish_screener_sync_staged_generation_v1`**, and Postgres truth. Worker writes prepared artifacts via existing **`radar-worker-bridge`** pattern (`RADAR_WORKER_SECRET`), not `SUPABASE_SERVICE_ROLE_KEY` on Fly.

Batch 190 explicitly chose Architecture A (Edge staging) over Fly; that choice stands until production proves finalize still exceeds Edge CPU after 190.14-class fixes.

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
- **Active Lovable integration branch:** `cursor/lovable-sync-from-main-20261024`. After each `main` merge, **forward-sync** the integration branch from `main` without merging the whole integration branch into `main`. Do not merge `cursor/chat-single-pass-v1`.
- **Archived recovery branch:** `cursor/chat-single-pass-v1`. Source of analyst commits below; large divergence is historical — not current Lovable sync state. Do not merge it.
- `origin/cursor/catalyst-evidence-depth-v2` (`c3bb034a`) is a narrower parallel of the same analyst work. Recovery used archived-branch versions.

## GitHub ↔ Lovable Source Synchronization

- **Authoritative source:** GitHub `main` is the authoritative application history. Lovable does not replace `main`; the integration branch carries Lovable-native overlays on top of forwarded `main` commits.
- **Integration branch:** `cursor/lovable-sync-from-main-20261024`. Preserve Lovable-only paths there; never merge that branch wholesale into `main` as a substitute for review.
- **Batch 211 controller:** `.github/workflows/lovable-source-forward-sync.yml` plus `scripts/lovable-sync/forward-sync.mjs`. Default runs are **read-only** (`check`). **Apply** (push to integration) requires repository variable `STOCKSIST_LOVABLE_SYNC_ACTIVATED=true` and owner-approved configuration; PR runs never apply.
- **Trigger and conflict protection:** When activated, pushes to `main` can run check then apply. The controller fetches fresh tips, validates overlay allowlists and ancestry, merges only in a disposable worktree, and **never** force-pushes, rebases, or resets protected refs. **CONFLICT** or **UNKNOWN** ends the run without overwriting the integration branch. Bounded retries handle normal concurrent push rejection only.
- **Separation from deploy:** Source sync does **not** deploy Vercel, Fly, Lovable Edge Functions, or apply SQL. Those stay separate owner-approved batches and Lovable Cloud operations.
- **Recovery, disable, rollback:** Remove or set `STOCKSIST_LOVABLE_SYNC_ACTIVATED` to non-`true` to keep all runs check-only. On conflicts or bad merges, fix on a reviewed branch and fast-forward only after human verification — see `docs/release/batch211-lovable-source-forward-sync-v1.md`. Do not “recover” with `--force` on integration or `main`.
- **Lovable editor SHA:** Remote Git integration tip **≠** guaranteed Lovable editor loaded commit. Independently verify the Lovable project’s reported active SHA or supported Git re-check after a sync.

**Monitoring (ongoing):**

- Compare **`origin/main`** and **remote integration** tip SHAs; record last **SYNCED** / successful apply from workflow artifacts.
- Capture **Lovable editor / project active SHA** when the product exposes it; treat absence as unknown for editor parity.
- Track **last successful synchronization** (artifact timestamp + integration `integration_sha_after` from `status.json`).
- **Failed runs** (FAILED job, or `status` not SYNCED on apply): alert owners; **CONFLICT** / **UNKNOWN** require human triage — no silent ignore.
- **Escalation:** CONFLICT or UNKNOWN means automatic forward-merge stopped; do not bypass with force-push or unapproved shortcuts.
- **No silent failures** and **no automatic force-push recovery** — ever.

**Issue tracking:** **ISS-040** stays **OPEN** until real **GitHub `main` → Lovable integration** automatic synchronization is **verified** in production (not merely merged). Latest human-verified numbers belong in `docs/DEPLOYMENT_STATUS.md`; **per-run** evidence stays in **GitHub Actions artifacts**, not a new doc commit on every sync.

## Master roadmap (2026-10-28)

- **Active register:** `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md` (batches **190–209**).
- **Current continuity state:** Batches **190.9–190.15** are merged on `main`; Batch **190.15** Edge + migration activation is reported complete. November 2 premarket acceptance is recorded. Batch **191** remains **PARTIAL** until regular-session and after-hours evidence is verified (**ISS-034 OPEN**).
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

## Catalyst attribution (client, Batch 181, Batch 195.1)

Persisted `attribution_class` on stored rows is not trusted over live headline evidence for generic news providers. SEC / earnings calendar / company IR rows keep authoritative persisted classes. A related headline stays on `related_symbols` and in the attribution result, and must not be labeled as the row symbol's own earnings or press release. Editorial news (Motley Fool, Zacks, and the other editorial publishers) is News. Press Release is only a direct issuer wire or company IR item. The Polygon source badge follows that same rule. For non-authoritative providers, unknown issuer attribution does not default to Press Release from the wire name alone. A related or unverified association is not labeled as that symbol's earnings or press release; `CatalystDetailPanel` does not show EPS or surprise Market Facts for those rows. Cross-surface copy uses `catalyst-attribution-presentation.ts` and `presentation.ts`; do not imply price causation without evidence. Do not rewrite production `catalyst_events` rows from this rule — hydration applies it on read.

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
