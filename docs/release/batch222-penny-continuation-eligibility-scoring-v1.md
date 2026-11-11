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
| **AM Inbox handoff** | Late-session RPC + client map/build | Continuation cards | **New surface:** optional `penny_continuation` payload **alongside** existing continuation (never overwrite). |
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
| E1 Price band | `0 < price < 1.00` USD (4dp display); exclude `price <= 0` | Verified last: `lastTrade.p` or `min.c` with `parseProviderTimestampMs` |
| E2 Price timestamp | Observation time ≤ sync clock + skew (`PROVIDER_FUTURE_SKEW_MS`) | `min.t`, `updated`, or `lastTrade.t` |
| E3 Session volume | Positive **session-scoped** cumulative shares via `sessionQualificationVolume` | `session-volume.ts`; extended semantics per observation kind |
| E4 Dollar liquidity | `price * sessionVolume` ≥ gate (see table §5) | Derived; both inputs required |
| E5 Move vs prior close | `changePercentVsPriorRegularClose` non-null OR explicit gap %; reject `impliesSplitScale` | `prevDay.c` only |
| E6 Spread quality | `spreadPct` ≤ max OR `UNKNOWN` fails if spread required for session | NBBO / snapshot when present |
| E7 Minimum velocity | Short-window shares/minute ≥ gate (see §5) | Bar/trade-derived; **not** fabricated |
| E8 Catalyst freshness | If catalyst required: verified catalyst ≤ max age; else category `NONE` allowed only when gate marked optional | Catalyst store / feed |
| E9 Float turnover | Only when `floatShares` verified; else gate skipped (not auto-pass) | Float provider |
| E10 Instrument | Exclude types in continuation exclude list (ETFs test, warrants test) | `CONTINUATION_EXCLUDED_INSTRUMENT_TYPES` pattern |
| E11 Session calendar | Respect equity session control; no overnight volume unless pipeline ready | Batch 215/221 |
| E12 Not duplicate volume | Same snapshot must not count AH incremental as premarket overnight | `sessionQualificationVolume` |

**Pseudocode — eligibility skeleton:**

```text
function evaluatePennyContinuationEligibility(input: PennyContinuationInput): EligibilityResult
  if !isPositivePriceBelowOne(input.price) return disqualify("PRICE_OUT_OF_BAND")
  if !verifiedObservationTimestamp(input) return unavailable("MISSING_OBSERVATION_TS")
  vol ← sessionQualificationVolume(input.ticker, volumeContextFromMeta(...))
  if vol == null return unavailable("SESSION_VOLUME_UNAVAILABLE")
  if vol < MIN_SESSION_SHARES return disqualify("SESSION_VOLUME_LOW")
  dollar ← price * vol
  if dollar < MIN_DOLLAR_VOLUME return disqualify("DOLLAR_VOLUME_LOW")
  move ← changePercentVsPriorRegularClose(price, ticker)
  if move == null && gapSuppressedOnlyBySplitScale(ticker) return unavailable("SPLIT_SCALE_GUARD")
  if move == null return unavailable("MOVE_UNAVAILABLE")
  if abs(move) < MIN_MOVE_PCT return disqualify("MOVE_TOO_SMALL")
  if spread known and spread > MAX_SPREAD return disqualify("SPREAD_WIDE")
  if sharesPerMinute < MIN_SHARES_PER_MINUTE return disqualify("VELOCITY_LOW")
  return eligible(vol, dollar, move, ...)
```

---

## 4. Continuation qualification (sustained momentum)

Continuation is **separate** from eligibility: a symbol may be **eligible** but **not** a continuation candidate.

| Signal | Meaning | Available when | Invalidation |
| --- | --- | --- | --- |
| C1 Sustained trend | No single-bar spike: velocity STRONG/MODERATE in ≥2 windows | Minute/trade windows | Velocity NONE in latest window |
| C2 VWAP hold/reclaim | Same tri-state model as Continuation V1 | `vwap`, `aboveVwap`, `holdingVwapAfterReclaim` | Price below VWAP with `lateSessionBroken` |
| C3 HOD proximity | `distanceFromHodPct` ≤ tier | Session high known | New low below session structure |
| C4 Reacceleration | Radar lifecycle `radarHasReAcceleration` or volume accel % | Radar V2 event fields | Event expired / invalidated |
| C5 Second leg | `radarHasSecondLeg` TRUE | Radar V2 | FALSE with catalyst invalidated |
| C6 Late-day continuation | Power Hour or AH flags from `resolveContinuationSessionWindow` | Timestamps in window | Outside window |
| C7 Next-session carry | Optional overlap with `DAY_TWO_WATCH` **only as label**, not merged score | Prior session close + AH extend | `closingRejection` TRUE |

**Continuation qualifies** when:

- Eligibility passes, **and**
- At least **K-of-N** continuation signals pass (see §5), **and**
- No active invalidator (spread blowout, catalyst invalidated, broken VWAP with rejection).

**Expiry:** Observation older than `MAX_OBSERVATION_AGE_MS` from sync clock → `EXPIRED`. Requalification requires fresh snapshot on same `sessionDate`.

---

## 5. Owner decision table — thresholds (**PROPOSED — NOT APPROVED**)

| # | Parameter | Proposed value | Gate vs rank | Rationale |
| --- | --- | --- | --- | --- |
| 1 | **Min price** | `> $0.0001` | **Gate** | Exclude zero/negative; allow sub-penny display with 4dp. |
| 2 | **Max price** | `< $1.00` (strict) | **Gate** | Distinct from `band_1_2` radar band. |
| 3 | **Min session shares** | **500,000** | **Gate** | Penny names need real participation; below this, % moves are noise. |
| 4 | **Min dollar volume** | **$250,000** | **Gate** | Liquidity floor; aligns below continuation-v1 critical tiers but stricter than pure % traders. |
| 5 | **Min shares/minute (10m)** | **25,000** sh/min | **Gate** | Volume king: favors names printing size, not illiquid pops. |
| 6 | **Min time-adjusted RVOL** | **2.0×** when baseline trustworthy; else **unavailable** | **Rank** (optional gate) | Reuse `assessRvolConfidence`; no invented baseline. |
| 7 | **Min move vs prior close** | **+3.0%** (long-bias default); symmetric for display | **Gate** | Must exceed noise; uses `prevDay.c` only. |
| 8 | **Max spread** | **2.5%** of mid | **Gate** when spread present | Wide spreads fail closed; missing spread → rank penalty not auto-pass. |
| 9 | **Max HOD distance** | **≤ 5%** for continuation tier A; **≤ 12%** tier B | **Rank** | Near-high continuation; wider = weaker. |
| 10 | **Catalyst** | Verified within **72h** for tier A; optional for tier B | **Rank** | Fresh catalyst boosts rank, not mandatory for all tiers. |
| 11 | **Float turnover** | Score only if float verified; min **0.5×** float for tier A | **Rank** | No float → component omitted (coverage ↓). |
| 12 | **Requalification cooldown** | **5 minutes** same symbol | **Engine** | Prevent thrash on same snapshot generation. |
| 13 | **Invalidation** | VWAP break + **-2%** from session high | **Engine** | Hard drop from continuation set until reset. |
| 14 | **Observation max age** | **120 seconds** behind sync clock | **Engine** | Stale prints excluded from live continuation. |

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
  expiresAt: string | null;
}
```

### Reason codes (stable)

`PRICE_OUT_OF_BAND`, `SESSION_VOLUME_UNAVAILABLE`, `SESSION_VOLUME_LOW`, `DOLLAR_VOLUME_LOW`, `MOVE_UNAVAILABLE`, `SPLIT_SCALE_GUARD`, `SPREAD_WIDE`, `VELOCITY_LOW`, `OBSERVATION_STALE`, `HOD_TOO_FAR`, `VWAP_BROKEN`, `CATALYST_INVALIDATED`, `DATA_UNAVAILABLE`, `FLOAT_UNAVAILABLE`.

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
pennyContinuationRank()  ──► optional publish table / Radar badge / Inbox column
        │
        ├── Watchlist / Catalyst / AI Analyst (existing symbol routes)
        ├── AM Inbox (separate card type or badge — owner UI batch)
        └── Historical Intelligence (episode hook — deferred)
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

| ID | Scenario | Expected |
| --- | --- | --- |
| F01 | Price $0.85, 2M shares, 40k sh/min, +8% vs prev close | Eligible + continuation qualified |
| F02 | Price $1.01 | `PRICE_OUT_OF_BAND` |
| F03 | Price $0.50, high % but 50k shares session | `SESSION_VOLUME_LOW` |
| F04 | `impliesSplitScale` on prev close | `SPLIT_SCALE_GUARD` / unavailable move |
| F05 | AH `min.av` only, wrong observation kind | Volume unavailable (session-volume) |
| F06 | Missing `min.t` | `MISSING_OBSERVATION_TS` |
| F07 | Wide spread 5% | `SPREAD_WIDE` |
| F08 | HOD distance 15% | Eligible but weak continuation rank |
| F09 | Penny panel row without velocity | **Not** auto continuation |
| F10 | Same symbol re-eval inside 5m | Cooldown / dedupe |
| F11 | Catalyst 96h old | Rank penalty, not hard fail if tier B |
| F12 | Float unverified | Score coverage < 100%, no fabricated turnover |

**Test types (Batch 200):** Deno unit (eligibility), selection parity (volume-first order), Vitest handoff URL builders, optional Postgres RPC contract tests.

---

## 10. Owner decisions required

1. Approve or revise **all §5 thresholds** (marked PROPOSED).
2. Confirm **strict `< $1.00`** vs include `$1.00` boundary.
3. Choose **K-of-N** continuation signals (proposed **3-of-5** core signals).
4. Decide AM Inbox surfacing: **badge only** vs dedicated card type.
5. Confirm **no** automatic inclusion in Five Pillars tabs without separate approval.

---

## 11. References

- `docs/release/batch174-175-monday-acceptance-inbox-v1.md` (Penny vs Continuation classification)
- `docs/release/batch175-continuation-inbox-acceptance-v1.md`
- `docs/release/STOCKSIST_MASTER_PENDING_BACKLOG_2026-10-28.md` (Batches 199–200)
- `supabase/functions/_shared/screeners/continuation-v1.ts`
- `src/features/day-trade-radar-v2/multi-radar.ts` (`qualifiesPennyPrice`)

**Batch 222 delivers this contract only.** Implementation is **Batch 200**, blocked on owner threshold approval.
