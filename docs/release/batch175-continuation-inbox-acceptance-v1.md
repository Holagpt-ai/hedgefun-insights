# Batch 175 — Continuation & AM Inbox acceptance V1

**Depends on:** Batch **174** live-session evidence (partial — see `monday-scanner-acceptance-2026-10-26.md`).  
**Git baseline:** **`3ef97ee1`**. No new scanner engine in this batch.

## Intended workflow (canonical)

```mermaid
flowchart LR
  subgraph late [Late session ET]
    W[Fly worker / bridge]
    W --> U[late_session_handoff_upsert_v1]
  end
  subgraph am [Next AM session]
    I[AM Inbox et_date]
    I --> L[late_session_handoff_list_active_v1]
    L --> V[buildAmInboxLateSessionViewFromContexts]
    V --> UI[LateSessionHandoffsList]
  end
  U --> DB[(late_session_handoffs)]
  DB --> L
```

**Session labeling:** `resolveLateSessionExpiryState` — most categories active only when `amSessionDate === nextTradingDay(sourceSessionDate)`. **Monday captures appear Tuesday AM Inbox**, not Monday late evening (by design).

## Acceptance criteria

| # | Criterion | Status (2026-10-26) | Evidence |
| --- | --- | --- | --- |
| 1 | Worker persists qualified late-session captures | **NOT VERIFIED** | No production upsert log this session |
| 2 | RPC returns active rows for target `p_am_session_date` | **NOT VERIFIED** | Auth + DB not queried |
| 3 | Categories labeled (Power Hour, AH, HOD, Day-Two) | **PASS (regression)** | `LateSessionHandoffsList` + batch12 view tests |
| 4 | Qualified fallback when priority pool empty | **PASS (regression)** | `am-inbox-late-session-funnel.test.ts`, `am-inbox-default-list-regression.test.ts` |
| 5 | Expired captures omitted | **PASS (regression)** | `late-session-expiry` + batch12 |
| 6 | Security/symbol identity on handoff | **PASS (regression)** | Batch **173** + `late-session-workflow-handoff.test.ts` |
| 7 | Morning board merges continuation symbols | **PASS (code review)** | `AMInbox.tsx` `collectMorningBoardEnrichmentSymbols` |
| 8 | Prior-session copy (“not live market activity”) | **PASS (UI contract)** | HandoffCard disclaimer in component |

## Completed vs remaining

| Completed on `main` | Remaining for sign-off |
| --- | --- |
| Client funnel, collapse, priority scoring, qualified fallback UI | **Tuesday 2026-10-27 premarket:** verify Monday late captures visible with correct session date |
| RPC list/upsert/expire in migrations | Read-only count of active handoffs for `2026-10-27` |
| Bridge action `late_session_handoff_upsert` | Fly bridge success during **16:00–20:00 ET** Monday |
| Continuation RVOL baseline propagation (warning **#8**) | Live label spot-check on AM Inbox cards |

## Blockers

- **No production Postgres read** from this workspace (Lovable Cloud only for prod queries).
- **AM Inbox** requires authenticated Pro session for full UI acceptance.

## Penny Continuation (out of scope)

Penny **price-band** Radar panel ≠ Penny **Continuation** product. No separate handoff pipeline exists for sub-$1 continuation-only candidates. See `batch174-175-monday-acceptance-inbox-v1.md`.

## Follow-up implementation batch (if needed)

| Trigger | Batch |
| --- | --- |
| RPC returns rows but UI empty/wrong date | Bugfix: `amSessionDate` / expiry wiring |
| Worker never upserts during RTH late window | Ops: bridge/worker deploy parity (not Cursor migrations without approval) |
| Product requires Penny Continuation engine | **New batch** — spec + worker + panel distinct from `penny` price filter |
