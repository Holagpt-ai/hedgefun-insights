# Batch 223 — Penny Continuation backend engine V1

**Baseline:** `main` **`38ef764ab4754e454a5227ce987f5bab83718cb9`**  
**Contract:** `docs/release/batch222-penny-continuation-eligibility-scoring-v1.md` (owner-approved thresholds)  
**Model:** `penny_continuation_v1`

## Modules

| Module | Role |
| --- | --- |
| `../config/penny-continuation.config.ts` | Approved constants |
| `penny-continuation-types.ts` | Input/output, reason codes |
| `penny-continuation-freshness.ts` | Per-symbol clocks; no `max(symbol, generation)` |
| `penny-continuation-eligibility.ts` | Hard gates E1–E14 |
| `penny-continuation-signals.ts` | CS1–CS5 + invalidators |
| `penny-continuation-ranking.ts` | Score + sort keys |
| `penny-continuation-v1.ts` | `evaluatePennyContinuationV1` (+ cooldown / idempotency) |
| `penny-continuation-handoff.ts` | AM Inbox badge payload (no UI) |

## Entrypoint

```typescript
import { evaluatePennyContinuationV1, rankPennyContinuationCandidates } from "./penny-continuation-v1.ts";
```

Callers supply normalized Radar/Polygon evidence on `PennyContinuationInput` including `freshness` (aligned `generationSyncMs` + `generationSyncIso`, policy, delay, symbol observation ms). `enforcePublicationCooldown` affects notification dedupe only — qualification always re-evaluates. Idempotency cache is bounded (256) and revalidates freshness/expiry per hit.

## Boundaries (this batch)

- No Edge handler wiring, Postgres writes, Fly worker hooks, or Five Pillars integration.
- No automatic AM Inbox persistence — badge builder only.
- `OVERNIGHT_SCANNER_PIPELINE_READY` remains **false**; overnight volume claims fail closed.

## Tests

`batch223-penny-continuation_test.ts` (21 cases) — registered in `screener-deno-regressions.yml`.

## Activation gate

Owner approval for production surfacing (Radar badge, Inbox merge, env flags) is **out of scope** until a later activation batch.
