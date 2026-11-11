# Batch 221 — Overnight scanner backend pipeline V1

**Scope:** Overnight observation / volume semantics for the unified equities scanner. **No** production activation, Edge deploy, cron, secrets, or `OVERNIGHT_SCANNER_PIPELINE_READY = true`.

## Implemented

- **`resolveOvernightCycleAt`** — geometric Sun–Thu 21:00–04:00 ET → equity `tradeDate` (Sunday 21:00 → Monday cycle).
- **`session-sync-context.ts`** — `ObservationSessionKind` (`overnight`), `resolveObservationSessionKindAt`, `resolveScannerObservationSessionFields` (off until pipeline flag + activation).
- **`session-volume.ts`** — `overnightSessionVolume` (positive `min.av` only when `day.v` is not a prior-session cumulative), `overnightVolumeProvenance`, trade-date alignment via `equityTradeDateForVolume`.
- **`screener-session.ts`** — `equityTradeDateForVolume` for overnight cycle vs 04:00 ET surveillance roll.
- **`sync-screener-data/handler.ts`** — uses `resolveScannerObservationSessionFields` (behavior unchanged while `OVERNIGHT_SCANNER_PIPELINE_READY === false`).

## Still disabled (mandatory before live overnight scans)

1. `STOCKSIST_EQUITY_23X5_EXCHANGE_EFFECTIVE_DATE` (confirmed ET date).
2. `STOCKSIST_EQUITY_23X5_PROVIDER_OVERNIGHT_CONFIRMED=true` (owner-verified provider overnight trades/aggregates).
3. `STOCKSIST_EQUITY_23X5_OWNER_AUTHORIZED=true` (Lovable Cloud secret).
4. Flip **`OVERNIGHT_SCANNER_PIPELINE_READY`** to `true` in code after review + deploy (Batch 221 leaves it **`false`**).
5. Lovable Cloud deploy of `sync-screener-data` and an overnight acceptance window.

## Provider prerequisites (deployment dependencies — not claimed verified)

- Polygon/Massive must supply a **session-scoped overnight cumulative** (or a provable session reset at overnight open). **`day.v === 0` alone is not treated as proof** — `OVERNIGHT_PROVIDER_SESSION_VOLUME_VERIFIED` stays **`false`** until owner attestation.
- Overnight qualification requires **`overnightPipelineReady`**, sync clock in the geometric overnight window, and matching observation timestamps (`qualificationObservationKind`). A **03:59 ET overnight** stamp cannot qualify during a **04:05 ET premarket** sync.
- Owner must confirm overnight coverage for the subscribed tier before step 2 above.

## Verification

```sh
deno test --frozen --allow-read supabase/functions/_shared/screeners/batch221-overnight-pipeline_test.ts
deno test --frozen --allow-read supabase/functions/_shared/markets/equity-session-control_test.ts
deno test --frozen --allow-read supabase/functions/_shared/screeners/session-volume_test.ts
```

CI: **Screener Deno regressions** includes `batch221-overnight-pipeline_test.ts`.
