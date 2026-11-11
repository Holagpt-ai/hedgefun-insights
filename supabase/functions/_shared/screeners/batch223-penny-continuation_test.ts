import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PENNY_DOCUMENTED_PROVIDER_DELAY_MS,
  PENNY_MAX_OBSERVATION_AGE_MS,
} from "../config/penny-continuation.config.ts";
import { OVERNIGHT_SCANNER_PIPELINE_READY } from "../markets/equity-session-control.ts";
import { evaluatePennyContinuationEligibility, pennyPriceEligible } from "./penny-continuation-eligibility.ts";
import { assessPennySymbolFreshness } from "./penny-continuation-freshness.ts";
import { buildPennyAmInboxBadgePayload } from "./penny-continuation-handoff.ts";
import {
  comparePennyContinuationRank,
  rankPennyContinuationCandidates,
} from "./penny-continuation-ranking.ts";
import {
  countCorePasses,
  evaluatePennyCoreSignals,
} from "./penny-continuation-signals.ts";
import type { PennyContinuationInput } from "./penny-continuation-types.ts";
import {
  clearPennyContinuationLifecycleState,
  evaluatePennyContinuationV1,
} from "./penny-continuation-v1.ts";

const NOW = Date.parse("2026-11-11T15:00:00.000Z");

function freshNearRt(observationMs = NOW): PennyContinuationInput["freshness"] {
  return {
    evaluationClockMs: NOW,
    symbolObservationMs: observationMs,
    generationSyncIso: new Date(NOW - 2_000).toISOString(),
    verifiedExpectedProviderDelayMs: 0,
    dataDeliveryPolicy: "near_real_time",
  };
}

function baseInput(overrides: Partial<PennyContinuationInput> = {}): PennyContinuationInput {
  return {
    symbol: "ABCD",
    sessionDate: "2026-11-11",
    observedAt: new Date(NOW).toISOString(),
    price: 0.85,
    previousRegularClose: 0.787,
    movePercentVsPriorClose: 8,
    sessionVolumeShares: 2_000_000,
    dollarVolume: 1_700_000,
    sharesPerMinute10m: 40_000,
    spreadPct: 1,
    distanceFromHodPct: 3,
    vwap: 0.82,
    aboveVwap: "TRUE",
    holdingVwapAfterReclaim: "UNKNOWN",
    velocityWindowTiers: ["MODERATE", "STRONG", "STRONG"],
    volumeAccelerationPct: 20,
    timeAdjustedRvol: 2.5,
    rvolConfidence: "HIGH",
    floatShares: 10_000_000,
    floatVerified: true,
    floatTurnover: 0.2,
    catalystVerified: "TRUE",
    catalystAgeHours: 24,
    radarHasReAcceleration: "TRUE",
    radarHasSecondLeg: "TRUE",
    freshness: freshNearRt(),
    observationGenerationId: "gen-1",
    ...overrides,
  };
}

Deno.test("price boundaries — strict sub-dollar band", () => {
  assertEquals(pennyPriceEligible(0.85), true);
  assertEquals(pennyPriceEligible(1.0), false);
  assertEquals(pennyPriceEligible(0.0001), false);
  assertEquals(pennyPriceEligible(0.00011), true);
});

Deno.test("eligibility — liquidity and signed move", () => {
  const lowVol = evaluatePennyContinuationEligibility(baseInput({ sessionVolumeShares: 100_000 }));
  assertEquals(lowVol.passed, false);
  assert(lowVol.reasons.includes("SESSION_VOLUME_LOW"));

  const down = evaluatePennyContinuationEligibility(baseInput({ movePercentVsPriorClose: -5 }));
  assertEquals(down.passed, false);
  assert(down.reasons.includes("MOVE_TOO_SMALL"));

  const split = evaluatePennyContinuationEligibility(baseInput({ impliesSplitScale: true }));
  assert(split.reasons.includes("SPLIT_SCALE_GUARD"));
});

Deno.test("spread unknown — eligible with SPREAD_UNAVAILABLE", () => {
  const r = evaluatePennyContinuationEligibility(baseInput({ spreadPct: null }));
  assertEquals(r.passed, true);
  assert(r.reasons.includes("SPREAD_UNAVAILABLE"));
  assertEquals(r.coveragePenalty > 0, true);
});

Deno.test("CS1–CS5 signals and 3-of-5", () => {
  const full = evaluatePennyCoreSignals(baseInput());
  assertEquals(countCorePasses(full), 5);

  const twoOnly = evaluatePennyCoreSignals(
    baseInput({
      velocityWindowTiers: ["NONE", "WEAK", "NONE"],
      aboveVwap: "FALSE",
      holdingVwapAfterReclaim: "FALSE",
      distanceFromHodPct: 20,
      radarHasReAcceleration: "FALSE",
      volumeAccelerationPct: 1,
      radarHasSecondLeg: "FALSE",
    }),
  );
  assertEquals(countCorePasses(twoOnly), 0);

  const three = evaluatePennyCoreSignals(
    baseInput({
      radarHasReAcceleration: "UNKNOWN",
      volumeAccelerationPct: null,
      radarHasSecondLeg: "UNKNOWN",
      velocityWindowTiers: ["MODERATE", "STRONG", "STRONG"],
      distanceFromHodPct: 3,
      aboveVwap: "TRUE",
    }),
  );
  assertEquals(countCorePasses(three), 3);
});

Deno.test("continuation qualification end-to-end", () => {
  clearPennyContinuationLifecycleState();
  const ok = evaluatePennyContinuationV1(baseInput(), { skipCooldown: true });
  assertEquals(ok.qualifies, true);
  assertEquals(ok.continuationQualified, true);
  assertEquals(ok.corePassCount, 5);
  assertEquals(ok.dataFreshnessLabel, "live");

  const fail = evaluatePennyContinuationV1(
    baseInput({
      observationGenerationId: "gen-fail",
      freshness: { ...freshNearRt(), symbolObservationMs: NOW + 60_000 },
      velocityWindowTiers: ["NONE", "WEAK", "NONE"],
      aboveVwap: "FALSE",
      holdingVwapAfterReclaim: "FALSE",
      distanceFromHodPct: 20,
      radarHasReAcceleration: "FALSE",
      volumeAccelerationPct: 1,
      radarHasSecondLeg: "FALSE",
    }),
    { skipCooldown: true },
  );
  assertEquals(fail.continuationQualified, false);
  assert(fail.reasons.includes("CONTINUATION_SIGNALS_INSUFFICIENT"));
});

Deno.test("freshness — stale ticker on fresh generation", () => {
  const staleSym = assessPennySymbolFreshness({
    evaluationClockMs: NOW,
    symbolObservationMs: NOW - 400_000,
    generationSyncIso: new Date(NOW - 2_000).toISOString(),
    verifiedExpectedProviderDelayMs: 0,
    dataDeliveryPolicy: "near_real_time",
  });
  assertEquals(staleSym.hardFail, true);
  assert(staleSym.reasons.includes("OBSERVATION_STALE"));
});

Deno.test("freshness — 15m documented delay within tolerance", () => {
  const delayMs = 14.5 * 60_000;
  const f = assessPennySymbolFreshness({
    evaluationClockMs: NOW,
    symbolObservationMs: NOW - delayMs,
    verifiedExpectedProviderDelayMs: PENNY_DOCUMENTED_PROVIDER_DELAY_MS,
    dataDeliveryPolicy: "documented_delayed",
    enforceLiveSessionGuards: false,
  });
  assertEquals(f.hardFail, false);
  assertEquals(f.dataFreshnessLabel, "delayed");
});

Deno.test("freshness — beyond 15m + 120s", () => {
  const f = assessPennySymbolFreshness({
    evaluationClockMs: NOW,
    symbolObservationMs: NOW - 18 * 60_000,
    verifiedExpectedProviderDelayMs: PENNY_DOCUMENTED_PROVIDER_DELAY_MS,
    dataDeliveryPolicy: "documented_delayed",
    enforceLiveSessionGuards: false,
  });
  assertEquals(f.hardFail, true);
  assert(f.reasons.includes("OBSERVATION_STALE"));
});

Deno.test("freshness — provider delay unknown fail closed", () => {
  const f = assessPennySymbolFreshness({
    evaluationClockMs: NOW,
    symbolObservationMs: NOW - 1_000,
    verifiedExpectedProviderDelayMs: null,
    dataDeliveryPolicy: null,
  });
  assert(f.reasons.includes("PROVIDER_DELAY_UNKNOWN"));
});

Deno.test("volume-first ranking — percent move cannot beat liquidity", () => {
  clearPennyContinuationLifecycleState();
  const liquid = evaluatePennyContinuationV1(
    baseInput({ symbol: "HIGHVOL", sharesPerMinute10m: 50_000, movePercentVsPriorClose: 5 }),
    { skipCooldown: true },
  );
  const pop = evaluatePennyContinuationV1(
    baseInput({
      symbol: "LOWVOL",
      sharesPerMinute10m: 26_000,
      sessionVolumeShares: 600_000,
      movePercentVsPriorClose: 40,
    }),
    { skipCooldown: true },
  );
  const ordered = rankPennyContinuationCandidates([pop, liquid]);
  assertEquals(ordered[0]?.symbol, "HIGHVOL");
  assert(comparePennyContinuationRank(liquid, pop) < 0);
});

Deno.test("cooldown and idempotent generation key", () => {
  clearPennyContinuationLifecycleState();
  const first = evaluatePennyContinuationV1(baseInput(), { skipCooldown: true });
  const second = evaluatePennyContinuationV1(baseInput());
  assertEquals(second.stableRankingKey, first.stableRankingKey);
  const cooled = evaluatePennyContinuationV1(baseInput({ observationGenerationId: "gen-2" }));
  assert(cooled.reasons.includes("REQUALIFY_COOLDOWN"));
});

Deno.test("overnight pipeline disabled", () => {
  assertEquals(OVERNIGHT_SCANNER_PIPELINE_READY, false);
  const r = evaluatePennyContinuationEligibility(
    baseInput({ observationSessionKind: "overnight" }),
  );
  assert(r.reasons.includes("OVERNIGHT_VOLUME_UNVERIFIED"));
});

Deno.test("AM inbox badge payload", () => {
  clearPennyContinuationLifecycleState();
  const r = evaluatePennyContinuationV1(baseInput(), { skipCooldown: true });
  const badge = buildPennyAmInboxBadgePayload(r);
  assertEquals(badge?.kind, "penny_continuation_v1");
  assertEquals(badge?.corePassCount, 5);
});

Deno.test("near-real-time delayed label — not live when lag > 0", () => {
  const r = evaluatePennyContinuationV1(
    baseInput({ freshness: freshNearRt(NOW - 30_000) }),
    { skipCooldown: true },
  );
  assertEquals(r.dataFreshnessLabel, "delayed");
  assertEquals(r.qualifies, true);
});

Deno.test("observation slack constant matches contract", () => {
  assertEquals(PENNY_MAX_OBSERVATION_AGE_MS, 120_000);
});
