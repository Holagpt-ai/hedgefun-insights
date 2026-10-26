# Project memory

Canonical constraints for Stocksist. Batch runbooks under `docs/` stay the detailed history. This file is the short version agents must keep true.

Baseline for this memory: parent `origin/main` `03449198` (PR #163), with the AI Analyst catalyst recovery on this change set. Inspected 2026-10-24.

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
- Active Lovable integration branch: `cursor/lovable-sync-from-main-20261024`. Tip **`e4801e81`** (2026-10-25 Batch 177 forward-merge of `main` **`788b1b93`**). Application files match `main`; integration branch may carry Lovable-only files (e.g. `bun.lock`). Do not merge `cursor/chat-single-pass-v1`.
- Archived recovery branch: `cursor/chat-single-pass-v1`. It is the source of the analyst commits below. Its large git divergence is historical and is not the current Lovable or production sync state. Do not merge it.
- `origin/cursor/catalyst-evidence-depth-v2` (`c3bb034a`) is a narrower parallel of the same analyst work. This recovery used the archived-branch versions.

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

- This change does not deploy `chat`. Production chat keeps the previously deployed function until an approved Edge deploy.
- Dollar figures are extracted only from explicit text near a fiscal-year token. Headline-only evidence is not verified guidance.
- The prompt tells the model the packet is not a live quote or a real-time feed.

Do not restore that branch's copy of `supabase/functions/mcp/index.ts`. PR #162 on `main` is the canonical generated bundle.

## Data and deploy ownership

- Production schema history is `supabase/migrations/`. **Apply** migrations through Lovable Cloud (managed Supabase), not by ad hoc Cursor CLI against production. `drizzle/migrations/` is a mirror, not a second production log. See `docs/migration-drizzle-supabase-notes.md`.
- Vercel production follows GitHub `main` via the normal Vercel Git integration. Fly workers, SEC cron, and non-Supabase infra move only in an approved ops step.
- Edge Function **source** lives in git; **production deploy** of those functions is a Lovable Cloud responsibility unless a batch explicitly assigns another approved executor.
- Never delete or rewrite an applied Supabase migration. Add a corrective migration.
- Generated MCP output stays generator-owned (`scripts/mcp-edge-validate.mjs`).

## Deferred until a later approved batch

- Real-time feed upgrades
- AI Trader product work (`AI_TRADER_CURRENT_OPERATING_MODE` is `OFF`)
- Broker integration
- Billing go-live (the UI still says payment processing is being set up)
- Further SEC schedule, write-gate, or function changes. Gate I.3 activation already happened (see `docs/DEPLOYMENT_STATUS.md`). `docs/sec-edgar/unapplied-cron.sql` is a leftover draft, not the live schedule.
- Catalyst source enablement (`docs/catalyst-intelligence/batch34-catalyst-activation-sequence.md`)

## Approved next batches (2026-10-24 master reset)

See `docs/release/next-approved-batches.md` for the **171–183** register. `main` is **`7c2bf094`** (Batch **178** / PR **#179** merged atop Batch **180**). **174** remains an open conflicting pre-session PR. **181** (PR **#180**) catalyst/watchlist attribution open; **182** (PR **#181**) Five Pillars transparency open; **183** Radar tabs pending. Original ten Lovable scanner warnings: `docs/release/lovable-scanner-reliability-warnings.md`. npm and deploy findings stay on ISS-015 through ISS-019.

## Catalyst attribution (client, Batch 181)

Persisted `attribution_class` on stored rows is not trusted over live headline evidence for generic news providers. SEC / earnings calendar / company IR rows keep authoritative persisted classes. Cross-surface copy uses `catalyst-attribution-presentation.ts`; do not imply price causation without evidence.

## How to avoid another full audit

Each session reads this file, `docs/SESSION_HANDOFF.md`, and `docs/ISSUE_REGISTER.md`. Update those when a decision, defect, or deploy fact changes. `npm run integrity` covers navigation, sitemap/canonical agreement, brand hosts, MCP artifact agreement, and `origin/main` divergence. It does not replace an ops query of Vercel, Supabase, or Fly.

## Scanner volume contract (movers)

- Polygon snapshot `day.v=0` means **volume unavailable**, not verified zero session liquidity (`polygonSnapshotVolume` in `src/lib/markets/movers-integrity.ts`).
- Verified zero from cache/RPC still ranks **before** unknown volume in volume-first lists.
- Live regular-session acceptance is documented in `docs/release/scanner-live-market-acceptance-v1.md`; do not claim RTH acceptance from weekend or replay-only checks.
- Public `/markets/premarket` may use the same provider snapshot as gainers and losers, but a row with a timestamp is premarket only when that timestamp is inside 4:00–9:30 a.m. ET. Afternoon regular-session prints stay on the regular tabs. Extended volume comes from minute accumulation; missing volume stays blank. The public mover table does not invent RVOL or catalyst.

## Evidence labels

Use these words in handoffs and the issue register:

- **Confirmed** — checked against `main` or a command run in that session
- **Reported** — stated in an older runbook or checklist and not rechecked
- **Deferred** — intentionally out of scope
