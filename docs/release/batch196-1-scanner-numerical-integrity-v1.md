# Batch 196.1 — Scanner numerical integrity & volume provenance

**Scope:** Radar worker momentum metrics, intraday participation acceleration, volume display semantics (no publication architecture, thresholds, or ranking changes).

## Root causes

| Issue | Finding |
| --- | --- |
| Extreme `volume_acceleration_pct` (e.g. ~297,666%) | **CONFIRMED.** Prior 5m window used span-from-first-bar coverage; sparse bars at window start were treated as a full 5m denominator, producing near-zero `prevVel` and absurd percentages. |
| Cross-tab volume mismatch (e.g. PERI ~857K vs ~2.2M) | **NOT CONFIRMED as data error.** Traced paths: `session_volume` / TODAY VOL (cumulative at `provider_as_of`) vs `volume_velocity` / VOL SPEED (shares/min). Legitimate scope difference; copy clarified in `scanner-metric-copy.ts`. |
| RVOL conflation | **NOT CONFIRMED defect.** Existing guards: worker `computeRvol5m` requires TOD baseline samples; continuation capture requires verified baseline; premarket 5m RVOL intentionally unavailable outside regular session. |

## Changes

- **Coverage-gated acceleration:** Both windows need ≥4 distinct minutes with bar data before computing acceleration % (`VOLUME_ACCEL_MIN_COVERED_MINUTES`).
- **Distinct-minute coverage:** `rollingMinuteVolume` and worker `rollingWindowVolumeCoverage` count minute buckets with observations, not span from first tick to now.
- **Worker velocity:** `volume_velocity` uses verified minute coverage (≥1 minute), not fixed `/5` on partial windows.
- **UI copy:** TODAY VOL header distinguishes cumulative session volume from 5m / shares-min metrics.

## Before / after (acceleration)

| Scenario | Before | After |
| --- | --- | --- |
| Full 5m @ 500 sh/s vs full prior @ 50 sh/s | +900% | +900% (unchanged) |
| Full current 5m, prior window only 2 minutes with ~1 sh/s | Could show +100,000%+ | `null` → participation **UNAVAILABLE** |
| CJMB-class sparse prior (reported ~297,666%) | Shown as SURGING/EXTREME | `null` when coverage gate fails |

## Verification

- `npm run typecheck`
- `npx vitest run src/lib/radar/__tests__/intraday-participation.test.ts` (cache dedupe test may flake in isolation — unrelated to this batch)
- `deno test services/scanner-stream-worker/src/radar/momentum-metrics_test.ts`

## Production activation

- **Fly.io `scanner-stream-worker`:** required for worker momentum/acceleration fixes.
- **Vercel:** optional for TODAY VOL copy clarification only.
- **Lovable Edge / screener sync:** not required (no publication path changes).

**Rollback:** redeploy prior Fly worker image from last known-good release; revert Vercel if copy-only deploy applied.
