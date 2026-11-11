# Batch 224 — Penny Continuation controlled backend integration V1

**Baseline:** `main` **`3f904970348a11e4fec28e1d86222cbaede2e5e7`**  
**Engine:** Batch 223 **`penny_continuation_v1`** (merged PR **#240**)  
**Integration id:** `penny_continuation_integration_v1`

## Modules

| Module | Role |
| --- | --- |
| `penny-continuation-integration-types.ts` | Bounded input/output contract |
| `penny-continuation-radar-evidence.ts` | Radar V2.2 → Penny evidence (no fabricated CS1 windows) |
| `penny-continuation-market-adapter.ts` | Polygon snapshot + verified overlays → `PennyContinuationInput` |
| `penny-continuation-integration-v1.ts` | `evaluateBoundedPennyContinuationV1` entrypoint |

## Entrypoint

```typescript
import { evaluateBoundedPennyContinuationV1 } from "./penny-continuation-integration-v1.ts";
```

Callers supply an explicit candidate list (`PennyContinuationDiscoveredCandidate[]`), integration context (generation sync, delay policy, session date), and optional `verifiedVelocityWindows` for CS1. The layer adapts evidence, runs `evaluatePennyContinuationV1`, applies `rankPennyContinuationCandidates`, and may emit optional AM Inbox badge payloads. Volume-first ordering preserved.

## Data boundaries

- Symbol observation time comes from Polygon `updated` or Radar `provider_as_of` — **never** generation sync time.
- CS1 requires caller-supplied completed `velocityWindows`; Radar tiers/participation alone do not synthesize windows.
- Prior close conflicts between Polygon and Radar fail closed at the adapter.
- Overnight tagging honors `OVERNIGHT_SCANNER_PIPELINE_READY === false`.

## Not wired (this batch)

- `sync-screener-data`, Fly worker, Radar publication, Five Pillars, AM Inbox DB, cron, SQL, Edge deploy, production feature flags.

## Tests

`batch224-penny-continuation-integration_test.ts` (15) — registered in `screener-deno-regressions.yml`.

## Activation gate

Separate owner batch for Radar emphasis, Inbox persistence, and env-gated production invocation. Batch 223 merge is **GitHub integration only** — not production deployment.
