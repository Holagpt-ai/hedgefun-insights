# Batch 185 — Scanner evidence & input reliability V1 (+ 185.1 release safety)

**Base:** `main` `0fa177dd`  
**PR:** #187  
**Issues:** ISS-024 (partial), ISS-031 (provenance)

## Root causes (confirmed)

1. **Null `tab_evaluation_evidence` with published rows** — 4-arg RPC fallback or pre-migration DB left evidence null while `screener_results` validated.
2. **Strict evidence JSON parse** — one bad tab rejected the entire map.
3. **RPC fallback** — legacy RPC succeeded without atomic evidence; unsafe PATCH in 185.0 inferred full evaluation on the client.

## 185.1 corrections

| Area | Change |
| --- | --- |
| Client reconcile | **`publication_confirmed`** only — `published_count` from rows; no universe/zero-match/unresolved fabrication |
| Truth state | Rows with publication-confirmed → **Published results** + advisory; empty tabs stay **Evaluation evidence unavailable** |
| Edge PATCH | Guarded by `state_key` + `sync_run_id` + `rows_inserted`; exposes `tab_evaluation_evidence_persistence` |
| CI | `handler_evidence_persistence_test.ts` in screener Deno workflow |

## October 27 empty-tab behavior (after Vercel only)

| Tab / condition | UI truth |
| --- | --- |
| Gainers/Losers with published rows, null evidence | Shows rows as **Published results** (not “fully evaluated”) |
| Gainers/Losers zero rows, null evidence | **Evaluation evidence unavailable** (matches reported screen) |
| Gappers zero rows, prerequisite missing | **Gap inputs unavailable** (unchanged; Radar restore when eligible) |
| NHL zero rows, baseline available, null evidence | **Evaluation evidence unavailable** (not zero-match) |
| Homepage movers (BRAI, AXG, XXII, CLRO) | Polygon snapshot — not screener evaluation |

Full provider evaluation metadata requires **5-arg RPC + Edge deploy** (see Lovable checklist).

## Release dependencies

1. Lovable: migrations `20260914200000` (+ `20260917180200` if behind) — verify before apply: `docs/release/batch185-lovable-production-verification-checklist.md`
2. Edge deploy: `sync-screener-data` (185.1)
3. Vercel: client honesty + partial parse

## Verification

```sh
npm run typecheck
npm run test -- src/lib/screeners/__tests__/batch185-publication-evidence-reconcile.test.ts src/lib/screeners/__tests__/screener-truth-state.test.ts
npm run build
deno test --frozen supabase/functions/sync-screener-data/handler_evidence_persistence_test.ts
```

Production: **NOT VERIFIED** in Cursor.
