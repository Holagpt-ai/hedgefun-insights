# Session handoff

Update this file at the end of a session. The next session should be able to start from this page plus `docs/PROJECT_MEMORY.md` and `docs/ISSUE_REGISTER.md`.

## 2026-10-24 — Project intelligence and continuity V1

**Status:** documentation and integrity tooling only. No application behavior change. No production migration, Edge deploy, DNS, cron, or secret change.

**Base:** `origin/main` `63957b319be959888af59410bd36c58cce45fb6d`.

**Branch:** `cursor/project-intelligence-continuity-v1`.

**Pull request:** https://github.com/Holagpt-ai/hedgefun-insights/pull/163

### Completed

- Replaced the Lovable starter `README.md` with a Stocksist overview.
- Added `AGENTS.md`, project memory, architecture, route map, data services, deployment status, issue register, changelog, and release gates.
- Added `npm run integrity` and `npm run test:integrity`.
- Added an always-on Cursor rule that points agents at the session-start docs.
- Corrected Lovable history: active integration branch `cursor/lovable-sync-from-main-20261024` matches `main` after PR #162. `cursor/chat-single-pass-v1` remains the archived recovery source for ISS-001.
- Recorded Gate I.3 historical activation (migration applied, `sync-sec-edgar-filings` deployed, cron job 52, 22 records inserted, checkpoint advanced). Current live state was not re-queried. No SEC operation was changed.

### Completeness against `main`

| Area | On `main` | Missing from `main` | Deploy |
| --- | --- | --- | --- |
| Scanner / Radar | Screeners, `src/lib/radar`, `src/lib/screeners`, scanner worker, `radar-worker-bridge`, `radar-historical-context` | Nothing identified in this pass | Fly image versus `main` not queried |
| Catalyst Intelligence | Catalyst page, `src/lib/catalyst`, catalyst sync functions, intel migrations | Source activation still a plan (reported) | Edge revision not queried |
| Historical Intelligence | Backfill job, repeat-mover client, `scripts/historical`, catch-up migrations | Nothing identified in this pass | Job scale state not rechecked |
| SEC ingestion | `sync-sec-edgar-filings` and migrations through `20261024153000` | Nothing further identified in source | Historical verification: circuit-breaker migration applied, function deployed, cron job 52 active, one scheduled run inserted 22 records and advanced the checkpoint. Current live checkpoint was not re-queried (ISS-004) |
| Homepage / SEO | `Index.tsx` market pulse, canonical `stocksist.com`, sitemap function, Vercel host redirects | 27 public paths omitted from the main sitemap (info) | Production js `index-CpDXxxyv.js` observed; git SHA not in the manifest |
| Watchlist / Inbox | Public and dashboard watchlists, AM and PM inboxes, watchlist and brief functions | Nothing identified in this pass | Edge revision not queried |
| Action Center | `/dashboard/action-center` | Nothing identified in this pass | Follows the Vercel SPA deploy |
| AI Analyst | `/dashboard/ai`, `chat`, catalyst selection modules | Evidence Depth V2, chat delivery, and source recovery (ISS-001) | `chat` deploy SHA not queried |
| Journal | `/dashboard/journal` tree and `/journal` redirect | Nothing identified in this pass | Journal DB apply state not queried |
| Lovable MCP artifacts | `src/lib/mcp`, generated `supabase/functions/mcp/index.ts`, manifest, PR #162 | Do not copy the Lovable-branch bundle back | `mcp` deploy SHA not queried |

### Integrity run

`npm run integrity -- --verbose --remote` on this branch before the commit: **0 errors**, 1 warning, 125 routes.

The warning is the local production build hash `index-ACjVgNSC.js` differing from live `index-CpDXxxyv.js`. Remote fetch succeeded. The manifest has no git SHA, so the deployed commit was not identified. External authenticated workflows were not checked.

`npm run typecheck` and `npm run build` passed. `npm run test:integrity` passed (5 tests).

### Next approved batch

Port AI Analyst Catalyst Evidence Depth V2 and the chat catalyst-delivery changes onto current `main`.

- Recovery source: archived branch `origin/cursor/chat-single-pass-v1`
- Active Lovable integration branch `cursor/lovable-sync-from-main-20261024` already matches `main` in file contents. Leave it in place.
- Commits to preserve: `68c88114`, `2f22387b`, `ed75aa71`
- Touch only the analyst and chat files those commits own
- Do not merge the archived recovery branch
- Do not deploy Edge or run migrations in that batch unless a separate approval says so
- Rebase the port onto the `chat` and `src/lib/ai-analyst` modules that are already on `main`

After that port is merged, the following ops check is read-only: compare Vercel production SHA, Edge function versions, and Fly image digests with `main`. Do not change cron, secrets, or DNS in that check.

Still deferred after the port: real-time feed upgrades, AI Trader, broker work, billing go-live.
