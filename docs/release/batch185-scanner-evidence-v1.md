# Batch 185 — Scanner evidence & input reliability V1

**Base:** `main` `0fa177dd` (Batch **184** merged)  
**Issues:** ISS-024, ISS-031 (partial — provenance explanation)

## Root causes (confirmed in code)

1. **Missing persisted evidence with valid published rows** — When `screener_feed_state.tab_evaluation_evidence` is null (pre-migration column, or 4-arg RPC fallback that omits `p_tab_evaluation_evidence`), the client validated rows but `resolveScreenerTruthState` reported **Evaluation evidence unavailable** for Gainers/Losers and NHL despite published `screener_results`.
2. **Strict evidence JSON parse** — A single malformed tab entry caused `parseTabEvaluationEvidence` to reject the entire map, failing validation or leaving evidence empty.
3. **RPC fallback wiped evidence** — `sync-screener-data` retried `replace_screener_results_generation_v1` without the evidence argument, storing NULL over prior evidence when the 5-arg function was unavailable.
4. **Gappers extended session** — When sync evidence is `prerequisite_unavailable` and no gappers rows publish, client **Radar gap restoration** (`restoreExtendedSessionGappers`) remains the path; overlay prior-close enrichment runs on Edge during extended session (`loadRadarPreviousCloseOverlay`).

## Fixes (source)

| Area | Change |
| --- | --- |
| Client | `reconcilePublicationTabEvidence()` — metadata from validated published rows + tab_counts only |
| Client | `parseTabEvaluationEvidencePartial()` — skip bad tab keys/payloads |
| Client | `validateGeneration()` — partial parse + reconcile before success |
| Edge | After 4-arg RPC success, PATCH `tab_evaluation_evidence` when column exists |

## Homepage vs dashboard (Oct 27 ~08:15 ET examples)

Public **Market Pulse** / movers use **Polygon snapshot gainers/losers** (`market-pulse-select.ts`, `movers-provenance.ts`) — a **provider top-movers universe** with delayed snapshot rules, not Five Pillars or screener tab evaluation.

Authenticated **Screeners** tabs use **`sync-screener-data` → `screener_results`** with per-tab qualification and persisted **tab_evaluation_evidence**.

Representative symbols (BRAI, AXG, XXII, CLRO) can appear on the homepage as **verified provider movers** while dashboard tabs showed **evidence unavailable** because evidence JSON was missing on feed state, not because those symbols failed screener math. Homepage must not substitute for Radar/Five Pillars qualification.

## Release dependencies (not executed in this batch)

1. **Migration** `20260914200000_screener_tab_evaluation_evidence_v1.sql` (and follow-on RPC migrations) applied on production via **Lovable Cloud**.
2. **Edge deploy** `sync-screener-data` with evidence PATCH after RPC fallback.
3. **Vercel** deploy after PR merge for client reconcile + truth states.

## Verification

```sh
npm run typecheck
npm run test -- src/lib/screeners/__tests__/batch185-publication-evidence-reconcile.test.ts src/lib/screeners/__tests__/screener-truth-state.test.ts
npm run build
```

Production row/evidence read — **NOT VERIFIED** in this session (no production Supabase CLI).
