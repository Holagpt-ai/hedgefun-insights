# Batch 188 — Mobile Dashboard & Journal Reliability V1

**Issues:** ISS-032 (Journal terminal loading), ISS-027 (brief preview / Risk layout), ISS-030 (Carryover mobile density)  
**Base:** `main` **`d86e0c69`** (PR **#190** Batch 187 merged)

## Root causes

| Area | Cause |
| --- | --- |
| Journal | Exposed `loading` stayed true when `loadJournalGraph` failed because `liveDataReady` never became true (`loading \|\| !liveDataReady`). Overview/Trades checked loading before error; Calendar had no error branch. Failed live load could still route users into demo mode. |
| AI Brief | `summarizeBrief()` truncated at 320 chars inside sentences; header row competed for width on narrow viewports. |
| Risk & Attention | `SectionShell` showed skeleton placeholders whenever `loading` was true even if a prior `section` envelope existed; card wrapper could reserve vertical space on some mobile layouts. |
| Carryover | All historical pillar/evidence fields rendered expanded by default on every card. |

## Fixes

- **Journal:** Separate initial load vs refresh; bounded `withTimeout` on graph load; try/catch for rejections; terminal error + Retry on Overview, Trades, Calendar; stale refresh banner with retained same-user data; no demo substitution on live failure; generation fence unchanged.
- **AI Brief:** `summarizeBriefPreview()` for card preview only; mobile-friendly header wrap; tighter spacing; overflow-safe markdown.
- **Risk:** Skeleton only when `loading && !section`; content-height regression fixture for SPCX two-signal layout.
- **Carryover:** Compact default card + accessible Details / Hide details toggle; workflow handoffs preserved.

## Production dependencies

| Surface | Required |
| --- | --- |
| **Vercel** | Yes — Journal, AM Inbox, AI Brief, Carryover UI |
| **Edge / Supabase** | No changes in this batch |

Batch **187** Edge activation (`get-pre-market-workspace`, `sync-earnings-finnhub`, `sync-catalyst-events`) remains **separately gated**. Deployed earnings Edge revision ids: **UNKNOWN**.

## Verification

```sh
npx vitest run src/journal/__tests__/batch188-journal-loading-recovery.test.tsx
npx vitest run src/components/pre-market/__tests__/RiskAttentionList.test.tsx
npx vitest run src/components/dashboard/__tests__/AIBriefCard.test.tsx
npx vitest run src/lib/ai/__tests__/evidence.test.ts
npx vitest run src/features/day-trade-radar-v2/__tests__/CarryoverWatchPanel.test.tsx
npm run typecheck
npm run build
```

Authenticated Android production acceptance: **NOT VERIFIED** in Cursor.

## Continuity facts (2026-10-27)

- Batch **187** PR **#190** merged at **`d86e0c69`**; Vercel deploy for that commit **succeeded**.
- Lovable integration branch synchronized/corrected at **`491f65cc`** (only `bun.lock` differs from `main`).
- Batch **186** authenticated AM Inbox acceptance **pending**.
- Batches **184–187** are complete in git; do not treat as active implementation backlog.
