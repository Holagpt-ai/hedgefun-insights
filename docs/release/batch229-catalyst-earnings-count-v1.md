# Batch 229 — Catalyst Upcoming Earnings counter correction V1

**Date:** 2026-11-12  
**Baseline:** GitHub `main` `7d5c80fe8a082f5ee2c66b3baeef11b836ae1558` (pre–Batch 229 worktree)  
**Scope:** Frontend + client lib only — **no** SQL, Edge, Fly, cron, secrets.

## Production defect (confirmed ~12:42 PM ET, Nov 12)

| Signal | Observation |
| --- | --- |
| `earnings_calendar` | 913 rows with `report_date` ≥ Nov 12 |
| `catalyst_events` (future earnings) | 1,054 rows |
| Catalyst feed query | `eventDateOrder: asc`, `limit: 500`, no symbol |
| First 500 feed rows | Dated **Nov 9** (historical saturation) |
| Upcoming earnings in feed page | **0** |
| UI summary | **Upcoming Earnings: 0** (misleading) |

**Cause:** `Catalyst.tsx` derived **Upcoming Earnings** from the same bounded, ascending `event_date` feed. Historical rows fill the 500 cap before any future earnings appear.

## Fix

1. **`src/lib/catalyst/catalyst-summary-counts.ts`** — ET calendar horizon (inclusive last day, DST-safe stepping); `time_of_day` + explicit `event_time` reporting-window rules (BMO/AMC/during/unknown) without treating `published_at` as a release; bounded paginated scan ordered by `event_date`, `id` (cap 5,000); **Last 24h** head count with `published_at` ∈ [now−24h, now].
2. **`src/hooks/useCatalystSummaryCounts.ts`** — React Query wrappers (separate keys from feed).
3. **`Catalyst.tsx`** — Summary cards use dedicated queries; event feed/filter/sort/RLS unchanged.

**Also corrected:** **Reported in Last 24h** used the same feed-bound filter (same class of defect).

**Unchanged (still feed-limited):** Recent Company Events, Watchlist summary counts — acceptable for this batch; document only.

## Verification (local)

```sh
npm run typecheck
npm run test -- src/lib/catalyst/__tests__/catalyst-summary-counts.test.ts
npm run build
```

**Production acceptance:** Requires **Vercel** deploy of merged frontend only. No backend deploy. After deploy, Catalyst tab with no symbol filter should show non-zero **Upcoming Earnings** when `catalyst_events` holds future `provider_reported` earnings (Nov 12 snapshot: expected ≫ 0).

## Related issue

**ISS-046** — Catalyst upcoming earnings summary counter (misleading zero) — **fixed in git** pending merge + Vercel.
