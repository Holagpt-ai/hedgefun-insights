# Batch 212 — Operations Control Center V1 (read-only visibility)

**Route:** `/admin/operations` (inside `AdminLayout` → `AdminGuard`).
**Scope:** frontend only. No migration, Edge Function, cron, Fly, Vercel setting, secret, or Batch 210/211 controller change.

## What it answers

| Question | Where | Evidence source |
| --- | --- | --- |
| Is the scanner publishing? | Overview card + Scanner panel | `screener_feed_state` (`state_key = current`): `sync_run_id`, `status`, `synced_at`, `rows_inserted`, `updated_at` |
| How old is market data? | Provider freshness card, Scanner panel | `screener_feed_state.provider_as_of_min/max`, `radar_v22_feed_state.last_provider_event_at` |
| Which tabs are stale? | Scanner tab matrix | `screener_feed_state.tab_counts`, `tab_evaluation_evidence` (parsed with `parseTabEvaluationEvidencePartial`), `nhl_baseline_status` |
| Evidence of CPU exhaustion? | Edge runtime panel | **Unknown in V1** — job rows and Edge logs have no browser read path (see gaps) |
| Are workers functioning? | Worker panel | `radar_v22_feed_state` checkpoint row written by `stocksist-radar-v22-worker` |
| Is GitHub ahead of Lovable? | Source sync panel | Public GitHub REST: `branches/main`, `branches/cursor/lovable-sync-from-main-20261024`, `compare/main...integration`, latest `lovable-source-forward-sync.yml` run |
| Is production runtime verified? | Runtime identity cards | Batch 210 attestations in `docs/release/manifests/attestations/*.json` (bundled at build), bundle `VITE_VERCEL_GIT_COMMIT_SHA` |

## Status rules

Statuses: Healthy, Degraded, Failing, Unknown, Stale telemetry, Not configured, Not applicable.

- Missing evidence is **Unknown**, never Healthy. Unknown/not-configured pills are grey.
- Overall health is computed from user-impact components (scanner publication, provider freshness, Fly worker) first. A failing scanner is not hidden by healthy sync or provenance. Unknown provenance alone does not make overall Unknown.
- **Session-aware freshness** (`src/lib/ops/freshness.ts`): ET clock, weekends closed via `resolveSessionSchedule(date, null)`. Closed session → Not applicable. Screener window = `SCREENER_STALE_AFTER_MS` (20 min); provider data gets a 15-minute delayed-feed allowance, so the delayed Polygon tier is not flagged. Beyond 3× the window is Failing **only if** the holiday calendar is verified; `market_session_calendar` is service-role only, so V1 caps at Degraded with a holiday caveat.
- **Worker:** checkpoint older than 6 min (max checkpoint 300 s + slack) during a live session is **Stale telemetry** — a historical row is never treated as a current heartbeat. Worker version is always Unknown (not persisted anywhere readable).
- **CPU classification** (`classifyRuntimeFailure`): explicit CPU-limit wording → confirmed CPU exhaustion; HTTP 546 / `WORKER_LIMIT` → Edge resource limit (CPU or memory); generic 5xx and wall-clock timeouts are never CPU.
- **Job classification** (`classifyGenerationJob`): published+publish RPC rows → persisted; published without RPC record → Unknown; `failed` after all chunks → finalize failed after all chunks; `finalizing` with expired lease → stranded; `aborted/prior_generation_retained` → retained prior generation. Ready for data; **no data source in V1**.
- **Source sync ≠ deployment.** Integration containing main is Healthy *source sync* only. Runtime identity is Healthy only with a platform digest attestation; owner-reported versions (e.g. Edge v516) display as Unknown.

## Security

- Authorization: `AdminGuard` server-side `has_role(_user_id, 'admin')` RPC; route mounted under `AdminLayout`.
- Every Supabase read already has `SELECT` granted to `anon, authenticated` (`20260730010000_screeners_p1_r2a_feed_state_acl.sql`, `20260813210000_radar_v22.sql`), so no new data is exposed. GitHub data and attestations are public repository content.
- No writes, RPCs, `functions.invoke`, or non-GET requests (enforced by a source-scan test). All operator-visible text passes through `redactSecrets` (JWTs, bearer tokens, GitHub/Stripe keys, `apiKey=` params, connection strings).

## Refresh cost

Two single-row Supabase SELECTs every 60 s. Four unauthenticated GitHub GETs every 15 min (60/h/IP limit; rate-limit resolves to Unknown).

## Gaps (Unknown in V1, need separate approval)

| Metric | Why unknown | Proposed path |
| --- | --- | --- |
| Current/last generation job, chunks, finalize, leases, prior-generation retention, last runtime failure, persisted-vs-not | `screener_sync_generation_jobs` GRANT is service_role only | Admin-only `SECURITY DEFINER` read RPC gated by `has_role(auth.uid(),'admin')`, returning redacted control columns of the last N jobs (no `observation`, `all_tickers`, `merged_artifacts`) — **Batch 213 proposal** |
| Weekday holiday detection | `market_session_calendar` service_role only | Include calendar rows in the same admin RPC |
| Edge logs / HTTP 546 counts | Lovable Cloud only | Owner checks in Lovable Cloud |
| Fly worker version, true lease heartbeat, worker errors | `radar_v22_lease` service_role only; version not persisted | Later batch |
| Forward-sync `status.json`, activation variable | GitHub artifacts/variables require credentials | Owner checks Actions UI |
| Lovable editor SHA | No API | Manual check |
| Vercel build SHA | Only if Vercel exposes `VITE_VERCEL_GIT_COMMIT_SHA` to the build | Otherwise Not configured |

## Files

`src/lib/ops/{status,freshness,scanner,worker,release,sources,snapshot,redact}.ts`, `src/hooks/useOperationsSnapshot.ts`, `src/components/admin/operations/OpsPrimitives.tsx`, `src/pages/admin/AdminOperationsPage.tsx`, route/nav in `src/App.tsx`, `src/lazyPages.ts`, `src/layouts/AdminLayout.tsx`; tests under `src/lib/ops/__tests__/` and `src/pages/admin/__tests__/`.
