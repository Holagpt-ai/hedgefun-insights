# Batch 225 — Penny Continuation workflow handoff V1

**Baseline:** `main` **`8b7082e0a8bef24aa9ccdc5c6ca2fa70473042a2`** (includes Batch 224 PR **#241** merged at `74960a51e590d2c363213cd806643783c873db4b`)  
**Handoff id:** `penny_continuation_workflow_handoff_v1`

## Backend projection

| Module | Role |
| --- | --- |
| `penny-continuation-workflow-handoff-types.ts` | Versioned handoff contract |
| `penny-continuation-workflow-handoff.ts` | `projectPennyWorkflowHandoffsFromIntegration` |

Input: `PennyContinuationIntegrationResult` from Batch 224. Output: deterministic handoff bundle preserving evaluator scores, rank keys, provenance, idempotency keys, and AM Inbox badge payloads — **no re-qualification**.

`qualificationEvidenceKind`: `live_market` vs `prior_session_capture` (AM session vs source session).

## Client matcher (not wired to UI)

| Module | Role |
| --- | --- |
| `src/lib/am-inbox/penny-continuation-workflow-types.ts` | Client mirror types |
| `src/lib/am-inbox/penny-continuation-badge-match.ts` | `matchPennyContinuationBadgesToAmInbox` |
| `src/lib/am-inbox/penny-continuation-workflow-navigation.ts` | Reuses `amInboxWorkflowRoutes` / `amInboxNavigatePath` |

Rules: match symbol + `sourceSessionDate`; one badge per candidate; honor AM expiry; publication suppression does not hide badge; no new cards or Five Pillars changes.

### Badge integrity (PR #242 corrections)

- Projection rejects stale/contradictory results even when `continuationQualified=true` (stale freshness, observation reasons, integration session mismatch).
- Matcher validates badge kind/model, symbol, and `sessionDate` against handoff + AM Inbox row before attach.
- Penny navigation uses **only** the AM Inbox row `securityId` — never session-storage workflow cache.

## Boundaries

- No `sync-screener-data`, Fly, Radar publish, AM Inbox RPC/SQL, cron, feature flags, or React hook wiring.
- No migrations or new tables.

## Tests

- Deno: `batch225-penny-workflow-handoff_test.ts` (6) — screener CI
- Vitest: `batch225-penny-continuation-badge-match.test.ts` (13)

## Activation still requires

- Authorized caller to persist or render badges
- Owner approval for production integration and notification emit paths
