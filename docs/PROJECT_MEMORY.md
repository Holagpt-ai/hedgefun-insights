# Project memory

Canonical constraints for Stocksist. Batch runbooks under `docs/` stay the detailed history. This file is the short version agents must keep true.

Baseline for this memory: GitHub `main` at `63957b319be959888af59410bd36c58cce45fb6d` (PR #162), inspected 2026-10-24.

## Product

- Public name, domain, and canonical origin: Stocksist, `stocksist.com`, `https://stocksist.com`.
- Repository and several internal ids still say Hedgefun (`hedgefun-insights`, MCP server id `hedgefun-mcp`). Those ids are not the public brand.
- Legacy hostname redirects are declared in `vercel.json`. Do not advertise that host as a canonical origin.
- Lovable preview hosts are not production. `src/integrations/supabase/previewAuthStorage.ts` may list them for preview auth only.

## Source of truth

- GitHub `main` is the authoritative source. Lovable preview hosts are not a second production line.
- Active Lovable integration branch: `cursor/lovable-sync-from-main-20261024`. PR #162 is on `main`. That integration branch was then merged forward and its file contents match `main`. Use it for Lovable sync.
- Archived recovery branch: `cursor/chat-single-pass-v1`. Keep it only as the source for the analyst catalyst port below. Its large git divergence is historical and is not the current Lovable or production sync state.
- `origin/cursor/catalyst-evidence-depth-v2` (`c3bb034a`) is a narrower parallel of the same analyst work. Prefer a reviewed port from the archived recovery branch onto current `main`.

## Recovery candidates that must not be dropped

These changes are **absent from `main`** and preserved on the archived recovery branch `origin/cursor/chat-single-pass-v1`:

| Commit | Subject |
| --- | --- |
| `68c88114` | feat(ai-analyst): catalyst evidence depth v2 for CURRENT_CATALYST |
| `2f22387b` | fix(chat): prioritize catalyst evidence in bounded analyst intelligence delivery |
| `ed75aa71` | fix(ai-analyst): improve catalyst source recovery and financial fact extraction |

`main` does not contain `supabase/functions/chat/analyst-intelligence-delivery.ts`. The archived recovery branch differs from `main` by 22 files under `src/lib/ai-analyst/`, `supabase/functions/_shared/ai-analyst/`, and `supabase/functions/chat/` (+2288 / −74). Port those files after review. Do not restore that branch's copy of `supabase/functions/mcp/index.ts`; PR #162 on `main` is the canonical generated bundle.

## Data and deploy ownership

- Production schema history is `supabase/migrations/`, applied outside Cursor. `drizzle/migrations/` is a mirror, not a second production log. See `docs/migration-drizzle-supabase-notes.md`.
- Merging to `main` updates git only. Vercel, Supabase Edge, Fly, cron, and secrets move only in an approved ops step.
- Never delete or rewrite an applied Supabase migration. Add a corrective migration.
- Generated MCP output stays generator-owned (`scripts/mcp-edge-validate.mjs`).

## Deferred until a later approved batch

- Real-time feed upgrades
- AI Trader product work (`AI_TRADER_CURRENT_OPERATING_MODE` is `OFF`)
- Broker integration
- Billing go-live (the UI still says payment processing is being set up)
- Further SEC schedule, write-gate, or function changes. Gate I.3 activation already happened (see `docs/DEPLOYMENT_STATUS.md`). `docs/sec-edgar/unapplied-cron.sql` is a leftover draft, not the live schedule.
- Catalyst source enablement (`docs/catalyst-intelligence/batch34-catalyst-activation-sequence.md`)

## How to avoid another full audit

Each session reads this file, `docs/SESSION_HANDOFF.md`, and `docs/ISSUE_REGISTER.md`. Update those when a decision, defect, or deploy fact changes. `npm run integrity` covers navigation, sitemap/canonical agreement, brand hosts, MCP artifact agreement, and `origin/main` divergence. It does not replace an ops query of Vercel, Supabase, or Fly.

## Evidence labels

Use these words in handoffs and the issue register:

- **Confirmed** — checked against `main` or a command run in that session
- **Reported** — stated in an older runbook or checklist and not rechecked
- **Deferred** — intentionally out of scope
