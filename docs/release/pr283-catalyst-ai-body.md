## Summary

- **Catalyst (A / ISS-028):** Editorial publishers (Motley Fool, etc.) no longer surface as verified M&A/earnings from headline keywords alone — `classifyCatalyst` + `reconcileIngestCatalystEventType` on `sync-catalyst-events`, UI `reconcileCatalystEventTypeForPresentation`, AI Analyst `catalyst-selection` demotion (AWK merger-chatter case).
- **Watchlist AI (C):** Failed refresh with existing `analyzed_at` preserves prior analysis in `resolveWatchlistRowRequestStatus` (PR #275 containment preserved).
- **AI Analyst (D):** AWK Motley Fool merger-chatter regression; MRVL acceptance tests unchanged.
- **Continuity:** PROJECT_MEMORY, SESSION_HANDOFF, ISSUE_REGISTER, ARCHITECTURE, CHANGELOG updated. Preserves #280–#282, earnings ranking (ISS-026), PM gate (#282), Calendar V4 blocked, AI Trader shelved.

## Confirmed defects addressed

| Workstream | Defect | Correction |
| --- | --- | --- |
| A | Editorial M&A label on AWK Motley Fool | Editorial guard at classify, ingest, UI |
| C | Failed AI refresh blanks row | Keep succeeded when `analyzed_at` present |
| D | Internal catalyst rows retain inflated `eventType` | Reconcile before scoring |

## Not claimed fixed

- Watchlist `AI_PROVIDER_ERROR` upstream (~130–171 ms) — needs deploy/provider evidence
- ISS-006 catalyst distribution activation
- AM/PM brief provider failures beyond #275 classification
- Earnings Edge activation (`sync-earnings-finnhub`, etc.)

## Test plan

- [x] `npm run typecheck`
- [x] `npm run integrity`
- [x] Vitest: catalyst-event-type-integrity, batch11 watchlist, current-catalyst-acceptance/fallback, catalyst-presentation
- [x] Deno: `classify_integrity_test.ts`
- [ ] CI on PR
- [ ] Post-merge: Lovable Edge `sync-catalyst-events`, Vercel catalyst UI

## Production activation after merge

1. Vercel production frontend
2. Lovable Cloud Edge: `sync-catalyst-events`, `chat` (catalyst-selection mirror), Watchlist V2 functions