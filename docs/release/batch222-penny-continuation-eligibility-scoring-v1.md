# Batch 222 — Penny Continuation eligibility and scoring contract V1

**Type:** documentation-only design contract (Batch **199/200** precursor).  
**Source baseline:** GitHub `main` **`9931e7f5539c940a87ce6e00e3bea18ccd47fc3a`**.  
**Status:** **PROPOSED — NOT APPROVED** for any production threshold or engine activation.

## Purpose

Define an implementation-ready backend contract for a **distinct sub-$1 momentum-continuation engine** that complements—but does not replace—Stocksist’s unified scanner, Day Trade Radar V2, Five Pillars volume-first tabs, late-session continuation V1, and verified Catalyst intelligence.

This document is the owner approval artifact. **Batch 200** may implement only after explicit threshold sign-off.

---

## 1. Capability map (what exists vs what is new)

| Capability | Location | Role today | Penny Continuation reuse |
| --- | --- | --- | --- |
| **Penny Stocks price band** | `src/features/day-trade-radar-v2/multi-radar.ts` (`qualifiesPennyPrice`, panel `penny`) | Client-side Radar **discovery** filter (`under_1`, `band_1_2`, `band_2_5`) | **Reuse:** price band predicate only as a **necessary** (not sufficient) gate. **Do not** conflate with continuation qualification. |
| **Worker penny eligibility** | `services/scanner-stream-worker/src/radar/discovery-track.ts`, `pennyPanelPriceEligible` | Radar V2 publication rows for penny **panel** | **Do not** extend for continuation scoring; optional shared **price** helper only. |
| **Late-session Continuation V1** | `supabase/functions/_shared/screeners/continuation-v1.ts`, `continuation-types.ts`, `src/config/continuation.config.ts` | Price-agnostic **carry-forward** scoring (Power Hour, HOD, AH, Day-Two) for AM Inbox | **Reuse:** session windows, component scoring patterns, RVOL confidence wiring (`continuation-rvol-confidence.ts`), disqualifier shape, ranking keys pattern. **Do not** change V1 thresholds or categories. |
| **Session volume honesty** | `supabase/functions/_shared/screeners/session-volume.ts` | Observation-session volume for scanner qualification | **Reuse:** `sessionQualificationVolume`, `resolveVerifiedObservationMs`, overnight gates (Batch 221). **No** double-count AH/RTH/overnight. |
| **Volume-first scanner tabs** | `supabase/functions/_shared/screeners/selection.ts` | Five Pillars top-20 contract | **Reuse:** ranking philosophy (volume king, dedupe, symbol tie-break). **Do not** alter tab thresholds. |
| **Gap / prior close** | `selection.ts` (`previousRegularClose`, `gapPercent`, `impliesSplitScale`) | Verified move vs `prevDay.c` | **Reuse** for sub-$1 move gate; **fail closed** on split-scale suppression. |
| **Catalyst verification** | Catalyst feed + `provider_reported` | Verified event context | **Reuse** provenance rules; **no** invented headlines. |
| **Float** | `src/hooks/useRadarFloatForSymbols`, Edge float helpers | Best-effort float | **Reuse** only when `floatShares` provider-verified; else **UNKNOWN**, no turnover score. |
| **AM Inbox handoff** | Late-session RPC + client map/build | Continuation cards | **V1 recommendation:** **badge** on existing row (`penny_continuation` metadata); **no** new card type. Never overwrite Continuation V1 payload. |
| **Penny Continuation engine** | — | **Not implemented** | **Batch 200** only. |

**Explicit non-goals (Batch 222):** no new feed, no parallel full-market scanner, no change to Five Pillars publication, no automatic promotion from penny panel to continuation, no UI redesign.

---

## 2. Product definition — Penny Continuation V1

**Intent:** Identify **sub-$1 symbols exhibiting sustained intraday momentum continuation** (not one-tick spikes) with **verifiable liquidity and volume activity**, suitable for Radar emphasis, Watchlist/Catalyst handoffs, and optional AM Inbox surfacing.

**Distinct from:**

- **Penny panel:** price band + discovery rank only.
- **Continuation V1:** late-session / day-two **regime** scoring for **all** prices.
- **Gappers / Volume Spikes:** Five Pillars **tab** qualification at publication time.

**Engine id:** `penny_continuation_v1`  
**Model version field:** `model_version: "penny_continuation_v1"`

---

## 3. Eligibility contract (hard gates)

All gates are **fail-closed**. Missing essential evidence → `qualifies: false`, reason `DATA_UNAVAILABLE` or `DISQUALIFIED`, never silent pass.

| Gate | Rule | Evidence source |
| --- | --- | --- |
| E1 Price band | **Strict sub-$1:** `MIN_ELIGIBLE_PRICE < price < MAX_ELIGIBLE_PRICE` where `MAX_ELIGIBLE_PRICE = $1.00` (exclusive) and proposed `MIN_ELIGIBLE_PRICE = $0.0001` (exclusive); `$1.00` exactly is **out of band** | Verified last: `lastTrade.p` or `min.c` with `parseProviderTimestampMs` |
| E2 Price timestamp | Symbol observation ms from `resolveVerifiedObservationMs`; must not exceed evaluation clock + `PROVIDER_FUTURE_SKEW_MS` | `min.t`, `updated`, or `lastTrade.t` |
| E3 Session volume | Positive **session-scoped** cumulative shares via `sessionQualificationVolume` | `session-volume.ts`; extended semantics per observation kind |
| E4 Dollar liquidity | `price * sessionVolume` ≥ gate (see table §5) | Derived; both inputs required |
| E5 Move vs prior close | `changePercentVsPriorRegularClose` non-null OR explicit gap %; reject `impliesSplitScale` | `prevDay.c` only |
| E6 Spread quality | When `spreadPct` is a finite number: must be ≤ max (§5). When spread is **unknown**: eligibility may still pass with `SPREAD_UNAVAILABLE` (rank/coverage penalty only; **not** a silent liquidity pass) | NBBO / snapshot when present |
| E7 Minimum velocity | Short-window shares/minute ≥ gate (see §5) | Bar/trade-derived; **not** fabricated |
| E8 Catalyst freshness | If catalyst required: verified catalyst ≤ max age; else category `NONE` allowed only when gate marked optional | Catalyst store / feed |
| E9 Float turnover | Only when `floatShares` verified; else gate skipped (not auto-pass) | Float provider |
| E10 Instrument | Exclude types in continuation exclude list (ETFs test, warrants test) | `CONTINUATION_EXCLUDED_INSTRUMENT_TYPES` pattern |
| E11 Session calendar | Respect equity session control; no overnight volume unless pipeline ready | Batch 215/221 |
| E12 Not duplicate volume | Same snapshot must not count AH incremental as premarket overnight | `sessionQualificationVolume` |
| E13 Observation freshness | Provider watermark within **120s** of evaluation clock on current surveillance date (§4.1) | `provider_as_of_max`, generation `synced_at`, `resolveVerifiedObservationMs` |
| E14 Live generation guard | Feed generation must align `current` for live session (`assessScreenerGenerationSession`); cached prior-date snapshots **must not** surface as live continuation | `screener-session.ts` |

**Price predicate (reconciled, PROPOSED — NOT APPROVED):**

```text
MIN_ELIGIBLE_PRICE = 0.0001   // exclusive lower bound — owner must approve
MAX_ELIGIBLE_PRICE = 1.00     // strict upper bound — exclusive; $1.00 prints fail E1

pennyPriceEligible(price) :=
  isFiniteNumber(price)
  AND price > MIN_ELIGIBLE_PRICE
  AND price < MAX_ELIGIBLE_PRICE
```

Section §5 rows 1–2 express the same rule: minimum `> $0.0001`, maximum strict `< $1.00`.

**Move vs prior close (PROPOSED — NOT APPROVED):** Default engine is **long-bias continuation**. Eligibility uses **signed** `movePercent` from verified `prevDay.c` only (`changePercentVsPriorRegularClose`). Gate passes when `movePercent >= MIN_MOVE_PCT` (**+3.0%** proposed). Negative or flat moves → `MOVE_TOO_SMALL` (not continuation-long). **Absolute** `|movePercent|` is used for **display and rank context only**, not to satisfy the eligibility move gate. A symmetric short-continuation mode is **out of scope** for V1 unless owner approves a separate policy.

**Source evidence (required for live evaluation, PROPOSED — NOT APPROVED):**

| Field | Minimum evidence |
| --- | --- |
| Price | Provider last or minute close + parsed timestamp |
| Session volume | `sessionQualificationVolume` result (not raw `day.v` when observation kind forbids) |
| Prior close | `prevDay.c` on ticker meta; null + split guard → unavailable |
| Spread | Derived from bid/ask when both present; else explicitly `null` (unknown) |
| Velocity / HOD / VWAP | Same snapshot generation as price; no stitched stale highs |
| RVOL / float / catalyst | Provider or Stocksist verified stores only; never invented |

**Pseudocode — eligibility skeleton:**

```text
function evaluatePennyContinuationEligibility(input: PennyContinuationInput, ctx: EvalContext): EligibilityResult
  if !pennyPriceEligible(input.price) return disqualify("PRICE_OUT_OF_BAND")
  freshness ← assessObservationFreshness(input, ctx)  // §4.1
  if freshness.hardFail return freshness.reason  // OBSERVATION_STALE | CACHE_GENERATION_STALE | MISSING_WATERMARK
  if !verifiedObservationTimestamp(input) return unavailable("MISSING_OBSERVATION_TS")
  vol ← sessionQualificationVolume(input.ticker, volumeContextFromMeta(...))
  if vol == null return unavailable("SESSION_VOLUME_UNAVAILABLE")
  if vol < MIN_SESSION_SHARES return disqualify("SESSION_VOLUME_LOW")
  dollar ← price * vol
  if dollar < MIN_DOLLAR_VOLUME return disqualify("DOLLAR_VOLUME_LOW")
  move ← changePercentVsPriorRegularClose(price, ticker)
  if move == null && gapSuppressedOnlyBySplitScale(ticker) return unavailable("SPLIT_SCALE_GUARD")
  if move == null return unavailable("MOVE_UNAVAILABLE")
  if move < MIN_MOVE_PCT return disqualify("MOVE_TOO_SMALL")  // signed long-bias; not abs()
  if isFiniteNumber(input.spreadPct) and input.spreadPct > MAX_SPREAD return disqualify("SPREAD_WIDE")
  if sharesPerMinute < MIN_SHARES_PER_MINUTE return disqualify("VELOCITY_LOW")
  return eligible(vol, dollar, move, spreadNote: SPREAD_UNAVAILABLE if spread unknown, feedDelayMs: freshness.feedDelayMs, ...)
```

---

## 4. Continuation qualification (sustained momentum)

Continuation is **separate** from eligibility: a symbol may be **eligible** but **not** a continuation candidate.

### 4.1 Observation freshness, provider watermark, and honest delay labels

**PROPOSED — NOT APPROVED**

Freshness is evaluated against a **verified provider watermark**, not wall-clock alone on a cached row.

**Definitions:**

| Term | Meaning |
| --- | --- |
| `evaluationClockMs` | Sync or worker invocation clock (same role as screener `nowMs`). |
| `symbolObservationMs` | `resolveVerifiedObservationMs(ticker, evaluationClockMs, ctx)` for the price/volume fields used. |
| `generationWatermarkMs` | Parsed `provider_as_of_max` or generation `synced_at` for the active feed/screener generation. |
| `providerWatermarkMs` | `max(symbolObservationMs, generationWatermarkMs)` when both are finite; else the single finite value; else **null**. |

**Hard freshness gate (eligibility E13):**

```text
MAX_OBSERVATION_AGE_MS = 120_000   // PROPOSED — NOT APPROVED

if providerWatermarkMs == null → unavailable("MISSING_WATERMARK")
if assessScreenerGenerationSession({ nowMs: evaluationClockMs, referenceIso: generationSyncedAt }) == "previous_during_live"
  → disqualify or unavailable("CACHE_GENERATION_STALE")  // old cached snapshot must not present as live
if surveillanceDate(providerWatermarkMs) != surveillanceDate(evaluationClockMs) during live session
  → CACHE_GENERATION_STALE
if evaluationClockMs - providerWatermarkMs > MAX_OBSERVATION_AGE_MS
  → OBSERVATION_STALE (fail closed for live continuation)
```

**Feed delay (telemetry / UI, separate from hard gate):**

```text
feedDelayMs = evaluationClockMs - symbolObservationMs   // when symbolObservationMs finite, else null
```

- When `feedDelayMs` is known and `0 < feedDelayMs <= MAX_OBSERVATION_AGE_MS`, the symbol may still qualify but surfaces an honest **delayed data** label (same philosophy as mover/screener delayed stamps—not a fabricated live time).
- When `feedDelayMs > MAX_OBSERVATION_AGE_MS`, hard gate fires **before** continuation counting.
- Stale **cached** generations from a prior surveillance date during a **live** consumer session never receive live continuation qualification even if row `% move` looks attractive.

**Expiry / requalification:** After `OBSERVATION_STALE` or `CACHE_GENERATION_STALE`, requalification requires a new provider watermark on the **same** `sessionDate` after cooldown (§5 row 12).

### 4.2 Core continuation signals — five signals, 3-of-5 (**PROPOSED — NOT APPROVED**)

Only these **five core signals** participate in the **3-of-5** continuation qualification count. Each evaluates to **`PASS`**, **`FAIL`**, or **`UNKNOWN`**. **`UNKNOWN` does not count** toward the three required passes.

| Core ID | Signal | **PASS** when (all inputs verified) | **FAIL** when | **UNKNOWN** when |
| --- | --- | --- | --- | --- |
| **CS1** | Sustained velocity | Velocity tier **STRONG** or **MODERATE** in **≥2** of the last **3** completed short windows **and** latest window is not **NONE** | Latest window **NONE**, or fewer than 2 STRONG/MODERATE windows | Window series missing |
| **CS2** | VWAP structure | `aboveVwap === TRUE` **or** `holdingVwapAfterReclaim === TRUE` | `aboveVwap === FALSE` with price below VWAP and no reclaim | `vwap` null or tri-states UNKNOWN |
| **CS3** | HOD proximity | `distanceFromHodPct <= HOD_SIGNAL_MAX_PCT` (**12%** proposed for signal pass; tier A rank uses 5%) | `distanceFromHodPct > HOD_SIGNAL_MAX_PCT` when HOD known | Session high or distance null |
| **CS4** | Reacceleration | `radarHasReAcceleration === TRUE` **or** (`volumeAccelerationPct` finite and `>= REACCEL_MIN_PCT` proposed **15%**) | Explicit FALSE on radar flag **and** accel below threshold when accel known | Both radar flag UNKNOWN and accel null |
| **CS5** | Second leg | `radarHasSecondLeg === TRUE` | `radarHasSecondLeg === FALSE` | Tri-state UNKNOWN |

**Deterministic 3-of-5 count:**

```text
passCount = count(signal in [CS1..CS5] where signal.state === PASS)
continuationQualified := eligibility.passed
  AND passCount >= 3
  AND noActiveInvalidator(...)
```

**Invalidators (any → continuation false even if passCount ≥ 3):** known `spreadPct > MAX_SPREAD`, `catalystInvalidated === TRUE`, CS2 FAIL with `lateSessionBroken` (when that field is TRUE), `OBSERVATION_STALE`, `CACHE_GENERATION_STALE`.

### 4.3 Supplemental labels (not in 3-of-5 count)

These reuse Continuation V1 session semantics for **categorization, AM Inbox copy, and Radar badges only**. They **do not** increment `passCount` and **do not** substitute for a missing core signal.

| Label | Meaning | Source |
| --- | --- | --- |
| **SL1** Late-day continuation | Power Hour or AH window active per `resolveContinuationSessionWindow` | Continuation V1 windows |
| **SL2** Next-session carry | `DAY_TWO_WATCH`-style carry label when prior session structure supports it | Continuation V1; **not** merged into penny score |

**Pseudocode — continuation qualification:**

```text
function evaluatePennyContinuation(input, ctx): PennyContinuationResult
  elig ← evaluatePennyContinuationEligibility(input, ctx)
  if !elig.passed return result(continuationQualified: false, corePassCount: 0)
  states ← [evalCS1(input), evalCS2(input), evalCS3(input), evalCS4(input), evalCS5(input)]
  passCount ← count(s in states where s === PASS)
  if hasInvalidator(input) return result(continuationQualified: false, corePassCount: passCount)
  continuationQualified ← passCount >= 3
  supplemental ← [labelLateDay(input), labelNextSessionCarry(input)]  // SL1/SL2; not added to passCount
  return result(..., corePassCount: passCount, supplementalLabels: supplemental)
```

---


## 5. Owner decision table — thresholds (**PROPOSED — NOT APPROVED**)

| # | Parameter | Proposed value | Gate vs rank | Rationale |
| --- | --- | --- | --- | --- |
| 1 | **Min price (`MIN_ELIGIBLE_PRICE`)** | **`> $0.0001`** (exclusive) | **Gate** | Matches E1 `pennyPriceEligible`; prices `≤ $0.0001` fail. **Owner must approve** lower bound. |
| 2 | **Max price (`MAX_ELIGIBLE_PRICE`)** | **`< $1.00`** (strict, exclusive) | **Gate** | `$1.00` exactly is **out of band**; distinct from `band_1_2` radar band. |
| 3 | **Min session shares** | **500,000** | **Gate** | Penny names need real participation; below this, % moves are noise. |
| 4 | **Min dollar volume** | **$250,000** | **Gate** | Liquidity floor; aligns below continuation-v1 critical tiers but stricter than pure % traders. |
| 5 | **Min shares/minute (10m)** | **25,000** sh/min | **Gate** | Volume king: favors names printing size, not illiquid pops. |
| 6 | **Min time-adjusted RVOL** | **2.0×** when baseline trustworthy; else **unavailable** | **Rank** (optional gate) | Reuse `assessRvolConfidence`; no invented baseline. |
| 7 | **Min move vs prior close** | **+3.0% signed** (long-bias default) | **Gate** | `movePercent >= 3.0`; downward moves fail `MOVE_TOO_SMALL`. Absolute move is display-only unless owner approves a symmetric gate. |
| 8 | **Max spread** | **2.5%** of mid | **Gate** when spread **known** | Known wide spread fails; **unknown** spread → `SPREAD_UNAVAILABLE` (eligible with rank/coverage penalty, not auto-pass). |
| 8b | **HOD signal max (CS3)** | **12%** from HOD for **PASS** | **Signal** | Separate from tier-A rank 5%; **NOT APPROVED**. |
| 8c | **Reaccel min (CS4)** | **15%** volume acceleration when radar flag unknown | **Signal** | **NOT APPROVED**. |
| 9 | **Max HOD distance** | **≤ 5%** for continuation tier A; **≤ 12%** tier B | **Rank** | Near-high continuation; wider = weaker. |
| 10 | **Catalyst** | Verified within **72h** for tier A; optional for tier B | **Rank** | Fresh catalyst boosts rank, not mandatory for all tiers. |
| 11 | **Float turnover** | Score only if float verified; min **0.5×** float for tier A | **Rank** | No float → component omitted (coverage ↓). |
| 12 | **Requalification cooldown** | **5 minutes** same symbol | **Engine** | Prevent thrash on same snapshot generation. |
| 13 | **Invalidation** | VWAP break + **-2%** from session high | **Engine** | Hard drop from continuation set until reset. |
| 14 | **Observation max age (`MAX_OBSERVATION_AGE_MS`)** | **120 seconds** behind **`providerWatermarkMs`** | **Engine** | §4.1; distinct from `feedDelayMs` telemetry and delayed-data labels. |
| 15 | **Core continuation rule** | **3-of-5** on **CS1–CS5**; UNKNOWN non-qualifying | **Engine** | §4.2; SL1/SL2 excluded from count. |

Every row requires **owner approval** before Batch 200 encodes constants.

---

## 6. Ranking contract (volume is king)

**Primary key (desc):** `shares_per_minute_10m` (or available short-window velocity proxy).  
**Secondary key (desc):** `session_volume_shares`.  
**Tertiary key (desc):** `dollar_volume`.  
**Quaternary key (desc):** `continuation_score` (0–100, coverage-weighted).  
**Tie-break:** `symbol` ASC.

**Score components (proposed weights, NOT APPROVED):**

| Component | Weight | Notes |
| --- | ---: | --- |
| Shares/minute velocity | 30 | Primary |
| Session share volume | 25 | Volume king |
| Dollar volume tier | 15 | Liquidity |
| HOD proximity | 15 | Continuation shape |
| VWAP structure | 10 | When data exists |
| Catalyst freshness | 5 | Verified only |

Percent change **must not** outrank a higher-liquidity name with lower % move (enforced by primary sort keys).

**Stable ranking key:** `{sessionDate}:{symbol}:{model_version}:{observationMsFloor}` for idempotent publish rows.

---

## 7. Data schema (proposed)

### Input — `PennyContinuationInput`

Extends patterns from `ContinuationInput` with required penny fields:

```typescript
interface PennyContinuationInput {
  symbol: string;
  sessionDate: string;           // surveillance trade date (ET)
  observedAt: string;            // ISO UTC
  price: number | null;
  previousRegularClose: number | null;
  sessionVolumeShares: number | null;  // from sessionQualificationVolume
  dollarVolume: number | null;
  sharesPerMinute10m: number | null;
  spreadPct: number | null;
  distanceFromHodPct: number | null;
  vwap: number | null;
  aboveVwap: TriState;
  volumeAccelerationPct: number | null;
  timeAdjustedRvol: number | null;
  rvolConfidence: "HIGH" | "MEDIUM" | "LOW" | "UNAVAILABLE";
  floatShares: number | null;
  floatVerified: boolean;
  catalystVerified: TriState;
  catalystAgeHours: number | null;
  radarHasReAcceleration: TriState;
  radarHasSecondLeg: TriState;
  observationSessionKind: string | null;
  instrumentType: string | null;
  providerWatermarkMs: number | null;
  feedDelayMs: number | null;
  coreSignals: {
    cs1: "PASS" | "FAIL" | "UNKNOWN";
    cs2: "PASS" | "FAIL" | "UNKNOWN";
    cs3: "PASS" | "FAIL" | "UNKNOWN";
    cs4: "PASS" | "FAIL" | "UNKNOWN";
    cs5: "PASS" | "FAIL" | "UNKNOWN";
  };
}
```

### Output — `PennyContinuationResult`

```typescript
interface PennyContinuationResult {
  model_version: "penny_continuation_v1";
  symbol: string;
  sessionDate: string | null;
  qualifies: boolean;
  continuationQualified: boolean;
  eligibility: { passed: boolean; reasons: ReasonCode[] };
  continuation: { passed: boolean; signals: SignalCode[]; invalidators: ReasonCode[] };
  score: number | null;
  coveragePct: number;
  rankKeys: { sharesPerMinute: number | null; sessionVolume: number | null; dollarVolume: number | null };
  evidence: EvidenceProvenance;
  feedDelayMs: number | null;
  dataFreshnessLabel: "live" | "delayed" | "stale" | null;
  corePassCount: number;
  supplementalLabels: Array<"late_day" | "next_session_carry">;
  expiresAt: string | null;
}
```

### Reason codes (stable)

`PRICE_OUT_OF_BAND`, `SESSION_VOLUME_UNAVAILABLE`, `SESSION_VOLUME_LOW`, `DOLLAR_VOLUME_LOW`, `MOVE_UNAVAILABLE`, `MOVE_TOO_SMALL`, `SPLIT_SCALE_GUARD`, `SPREAD_WIDE`, `SPREAD_UNAVAILABLE`, `VELOCITY_LOW`, `MISSING_WATERMARK`, `MISSING_OBSERVATION_TS`, `OBSERVATION_STALE`, `CACHE_GENERATION_STALE`, `CONTINUATION_SIGNALS_INSUFFICIENT`, `HOD_TOO_FAR`, `VWAP_BROKEN`, `CATALYST_INVALIDATED`, `DATA_UNAVAILABLE`, `FLOAT_UNAVAILABLE`.

---

## 8. Integration architecture (Batch 200 target)

```text
Polygon snapshot / Radar V2 row
        │
        ▼
sessionQualificationVolume + verified timestamps
        │
        ▼
pennyContinuationEligibility()  ──fail──► honest absent row
        │
        ▼
pennyContinuationSignals()
        │
        ▼
pennyContinuationRank()  ──► optional publish table / Radar badge (not Five Pillars tab)
        │
        ├── Watchlist / Catalyst / AI Analyst (existing symbol routes)
        ├── AM Inbox (**badge on existing row** in V1 — no new card type)
        └── Historical Intelligence (episode hook — deferred)

**Five Pillars:** automatic tab inclusion **disabled** for Penny Continuation V1; no scanner publication hook without separate owner approval.
```

**Ownership:**

| Layer | Owner | Batch |
| --- | --- | --- |
| Eligibility + scoring Edge/Deno | Cursor | 200 |
| Persistence / RPC | Cursor + Lovable SQL approval | 200+ |
| Radar / Inbox UI | Lovable + Cursor handoffs | post-200 |
| Threshold constants | **Owner sign-off** | before 200 |

**Safeguards preserved:** Batch 215 session gate, Batch 221 overnight volume, Five Pillars unchanged, no scanner threshold edits in Batch 222.

---

## 9. Deterministic fixture scenarios (test matrix)

Each fixture lists **inputs sufficient to reproduce** the expected outcome under this contract. All numeric gates remain **PROPOSED — NOT APPROVED**.

| ID | Inputs (summary) | Expected |
| --- | --- | --- |
| F01 | `price=0.85`, `prevClose=0.787`, `move=+8%`, `sessionVol=2_000_000`, `dollarVol=1.7M`, `sh/min=40_000`, `spreadPct=1.0`, `providerWatermarkMs=now-30s`, generation **current**, `velocityWindows=[MODERATE,STRONG,STRONG]`, `aboveVwap=TRUE`, `distanceFromHodPct=3`, `radarHasReAcceleration=TRUE`, `radarHasSecondLeg=TRUE` | `qualifies=true`, `continuationQualified=true`, `corePassCount=5`, `dataFreshnessLabel=delayed` if `feedDelayMs=30s` |
| F02 | `price=1.01` | `PRICE_OUT_OF_BAND` |
| F02b | `price=1.00` exactly | `PRICE_OUT_OF_BAND` (strict `< $1.00`) |
| F03 | `price=0.50`, `sessionVol=50_000`, `move=+25%` | `SESSION_VOLUME_LOW` |
| F04 | `impliesSplitScale=true` on `prevDay.c` | `SPLIT_SCALE_GUARD` |
| F05 | AH `min.av` only, wrong observation kind | `SESSION_VOLUME_UNAVAILABLE` |
| F06 | Missing `min.t` / no verified observation ms | `MISSING_OBSERVATION_TS` |
| F07 | `spreadPct=5.0` (known) | `SPREAD_WIDE` |
| F07b | `spreadPct=null` | `qualifies=true` with `SPREAD_UNAVAILABLE`; rank/coverage penalty; CS pass count unchanged |
| F08 | Eligible base; `distanceFromHodPct=15`; CS1–CS2–CS4–CS5 PASS; CS3 FAIL | `continuationQualified=true` (`passCount=4`) but weaker HOD rank |
| F08b | Same as F08 but only CS1+CS2 PASS (2 core) | `CONTINUATION_SIGNALS_INSUFFICIENT` |
| F09 | Penny panel eligible price; `sh/min` below gate | `VELOCITY_LOW` |
| F10 | Same symbol re-eval inside 5m | Cooldown / dedupe; no double publish |
| F11 | `catalystAgeHours=96` | Rank penalty only; not core signal fail |
| F12 | `floatVerified=false` | `coveragePct < 100`; no fabricated turnover |
| F13 | `providerWatermarkMs=now-150s` | `OBSERVATION_STALE` |
| F14 | Live session; generation **previous_during_live** | `CACHE_GENERATION_STALE` |
| F15 | `move=-5%` (signed) | `MOVE_TOO_SMALL` (long-bias gate) |

**Test types (Batch 200):** Deno unit (eligibility + CS1–CS5 + freshness), selection parity (volume-first order), Vitest handoff URL builders, optional Postgres RPC contract tests.

---

## 10. Owner decisions required

All items remain **PROPOSED — NOT APPROVED** until explicit sign-off.

1. Approve or revise **all §5 thresholds** and §4.2 signal pass rules.
2. Approve **`MIN_ELIGIBLE_PRICE > $0.0001`** (exclusive lower bound) and confirm **strict `< $1.00`** upper bound (`$1.00` out of band).
3. Confirm **3-of-5** on **CS1–CS5** with **UNKNOWN non-qualifying** (contract default; revise only if product wants a different K or signal set).
4. Confirm long-bias **`movePercent >= +3.0%`** gate vs a future symmetric absolute gate.
5. **AM Inbox V1:** contract **recommends badge on existing row** (not a new card type); approve or override.
6. Confirm **Five Pillars automatic inclusion stays disabled** for Penny Continuation V1.

---

## 11. References

- `docs/release/batch174-175-monday-acceptance-inbox-v1.md` (Penny vs Continuation classification)
- `docs/release/batch175-continuation-inbox-acceptance-v1.md`
- `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md` (Batches 199–200)
- `supabase/functions/_shared/screeners/continuation-v1.ts`
- `src/features/day-trade-radar-v2/multi-radar.ts` (`qualifiesPennyPrice`)

**Batch 222 delivers this contract only (including PR #239 finalization pass).** Implementation is **Batch 200**, blocked on owner threshold approval.
