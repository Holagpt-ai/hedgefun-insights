# CATALYST-P1 — Sections 4–13 Execution Plan

## Phase A — Scheduler (forward-only cron migration)

New migration `catalyst_cron_schedules_v1`:
- `cron.unschedule` any existing job named `sync-catalyst-events-15min-weekdays` or `sync-catalyst-events-hourly-weekends`. No other cron touched.
- `cron.schedule` two jobs:
  - `sync-catalyst-events-15min-weekdays`: `*/15 * * * 1-5`
  - `sync-catalyst-events-hourly-weekends`: `0 * * * 0,6`
- Both call `net.http_post` to `/functions/v1/sync-catalyst-events`, read `sync_secret` from `vault.decrypted_secrets`, send `Authorization: Bearer <secret>`, `Content-Type: application/json`, body `{}`.
- Verify exactly one active row per name in `cron.job`.

## Phase B — Sanitized error surface

Refactor `sync-catalyst-events` to emit only controlled reason codes (`AUTH_FAILED`, `METHOD_NOT_ALLOWED`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMITED`, `PROVIDER_ERROR`, `DATABASE_ERROR`, `VALIDATION_ERROR`, `UNKNOWN`) and `[catalyst-sync]` prefixed logs with counts only. Redeploy.

## Phase C — Production Catalyst frontend

Files created:
- `src/hooks/useCatalystEvents.ts` — fetches `catalyst_events` with symbol/horizon/type filters + realtime-safe React Query keys; separate hook for `catalyst_user_state`.
- `src/lib/catalyst/parsers.ts` — pure normalizers (event-type label, time-of-day label, horizon window helpers, sort comparators, honest missing-value strings).
- `src/components/catalyst/` — `CatalystHeader.tsx`, `CatalystFilters.tsx`, `CatalystSummaryCards.tsx`, `CatalystEventCard.tsx`, `CatalystEmptyState.tsx`.

File replaced: `src/pages/dashboard/Catalyst.tsx` — removes CATALYSTS/RISK_WINDOWS/preview/fake-confidence/expected-move/priority/sentiment/related/outlook/alert artifacts. Implements:
- Header + subtitle + honest disclosure copy.
- `?symbol=` handling with normalization, invalid-symbol URL cleanup, `Clear Filter` action.
- Horizon filters (Today, Next 7 Days, Next 30 Days, Recent 72 Hours).
- Type filters (All + 8 canonical types).
- Workflow filters (All Events, My Watchlist, Saved, Reviewed).
- Deterministic sort: upcoming nearest-first, recent newest-first, ticker tiebreak.
- Summary cards derived from currently loaded rows only.
- Card contract: only available validated fields; unavailable language for missing ones.
- Actions: View Source (https + `noopener,noreferrer`), Ask AI Analyst → `/dashboard/ai?symbol=`, Open Watchlist → `/dashboard/watchlist`, Log in Journal → `/dashboard/journal?symbol=`, Open Stock Page (existing canonical route), Save, Mark Reviewed.
- User state via `catalyst_user_state`; `user_id` derived from `supabase.auth.getUser()`, never from client data.
- No Alert button. No "live"/"real-time" wording.

## Phase D — Screener wiring

- New hook `src/hooks/useCatalystEnrichmentForSymbols.ts` — batch fetch for currently displayed symbols only; picks nearest upcoming event, else newest recent (72h) event. Never affects sort/rank.
- `src/components/dashboard/ScreenerTable.tsx` — Catalyst/News column renders `{title · type · date}` linked to `/dashboard/catalyst?symbol=SYM` or "No recent catalyst found". Volume-descending order preserved.
- `src/hooks/useScreenerData.ts` untouched except for exposing symbol list to the enrichment hook via caller composition (no volume-order change).

## Phase E — AI Analyst context

- `src/components/dashboard/AIAnalystChat.tsx` — extend the existing dashboard-context loader to include Catalyst rows for (a) active handoff symbol, (b) user watchlist symbols, (c) upcoming 30d, (d) recent 72h. Send only: symbol, event_type, title, event_date, event_time when legitimate, time_of_day, source_name, verification_state. No raw bodies, no IDs, no scores. All existing behaviors preserved.

## Phase F — Tests

Deno tests co-located with shared modules:
- `_shared/catalyst/classify_test.ts` — every rule + `company_news` fallback, empty title, malformed ticker, forbidden score keys, multi-ticker.
- `_shared/catalyst/contract_test.ts` — dedupe key generation, ticker regex, https validation, hash fallback.
- `_shared/catalyst/sanitize_test.ts` — forbidden-key stripping, nested/array drop, non-negative int coercion.

Frontend tests (vitest):
- `src/pages/dashboard/__tests__/Catalyst.test.tsx` — rendering, symbol filter, invalid symbol cleanup, horizon/type/workflow filters, loading, empty, sanitized error, missing fields, earnings facts, source-link `rel`, save/unsave, review/unreview, no preview text.
- `src/components/dashboard/__tests__/ScreenerCatalyst.test.tsx` — enrichment rendering, empty fallback, volume order unchanged.

## Phase G — Deployment sequence

1. Apply Phase A cron migration.
2. Deploy Phase B sanitized `sync-catalyst-events`.
3. `bunx tsgo --noEmit -p tsconfig.app.json`.
4. `bun run test`.
5. `bun run build`.
6. `deno check` on every new/modified Catalyst edge/shared file.
7. `deno test` on new Catalyst shared suite.
8. Server-side invoke via cron `net.http_post` path (or `pg_net` directly with vault secret); capture status + summary.
9. Second invocation → confirm zero new upserts (dedupe).
10. Sanitized SQL proof: sample of 3 legitimate events, counts by event_type, upcoming vs recent, RLS + grant evidence.

Publishing the frontend is deferred to a separate explicit step after the pipeline proof passes.

## Phase H — Live proof + report

Return sanitized proof exactly per Section 12 (A–E) and the Section 13 completion report — files inspected/created/modified, migration filenames, cron job names/schedules/active status, tsgo/vitest/build/deno results, pipeline evidence, RLS evidence, dedupe evidence, regression evidence, blockers if any. Stop with a sanitized blocker (never fake data or relaxed RLS) if any Section 12 requirement fails.

## Technical notes

- All new SQL is forward-only; no historical migration edited.
- `catalyst_user_state.user_id` derived server-side from the authenticated session — client-provided `user_id` in payloads is ignored; RLS remains the ownership boundary.
- No changes to Watchlist V1/V2, Screener sync/rank, Journal, Action Center, Pre-Market, After-Hours, Recent Activity, Alerts, Payments, Pricing, Entitlements, Auth URLs, redirects, sitemap, newsletter sender, or any historical migration.
- `bun run build` and other verification commands run once at end of Phase G; not per file.

Approve and I'll execute Phases A through H in order.
