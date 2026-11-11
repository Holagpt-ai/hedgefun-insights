import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PENNY_DOCUMENTED_PROVIDER_DELAY_MS,
  PENNY_MAX_OBSERVATION_AGE_MS,
} from "../config/penny-continuation.config.ts";
import { OVERNIGHT_SCANNER_PIPELINE_READY } from "../markets/equity-session-control.ts";
import { evaluatePennyContinuationEligibility, pennyPriceEligible } from "./penny-continuation-eligibility.ts";
import { assessPennySymbolFreshness } from "./penny-continuation-freshness.ts";
import {
  buildPennyAmInboxBadgePayload,
  pennyContinuationMayEmitNotification,
} from "./penny-continuation-handoff.ts";
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
  const generationSyncMs = NOW - 2_000;
  return {
    evaluationClockMs: NOW,
    symbolObservationMs: observationMs,
    generationSyncMs,
    generationSyncIso: new Date(generationSyncMs).toISOString(),
    verifiedExpectedProviderDelayMs: 0,
    dataDeliveryPolicy: "near_real_time",
  };
}

function verifiedVelocityWindows() {
  return [
    { tier: "MODERATE" as const, sessionDate: "2026-11-11", windowEndMs: NOW - 180_000, completed: true },
    { tier: "STRONG" as const, sessionDate: "2026-11-11", windowEndMs: NOW - 120_000, completed: true },
    { tier: "STRONG" as const, sessionDate: "2026-11-11", windowEndMs: NOW - 60_000, completed: true },
  ];
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
    velocityWindows: verifiedVelocityWindows(),
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

  const down = evaluatePennyContinuationEligibility(
    baseInput({ price: 0.74765, movePercentVsPriorClose: -5, dollarVolume: 0.74765 * 2_000_000 }),
  );
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
      velocityWindows: [
        { tier: "NONE", sessionDate: "2026-11-11", windowEndMs: NOW - 180_000, completed: true },
        { tier: "WEAK", sessionDate: "2026-11-11", windowEndMs: NOW - 120_000, completed: true },
        { tier: "NONE", sessionDate: "2026-11-11", windowEndMs: NOW - 60_000, completed: true },
      ],
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
      velocityWindows: verifiedVelocityWindows(),
      distanceFromHodPct: 3,
      aboveVwap: "TRUE",
    }),
  );
  assertEquals(countCorePasses(three), 3);
});

Deno.test("continuation qualification end-to-end", () => {
  clearPennyContinuationLifecycleState();
  const ok = evaluatePennyContinuationV1(baseInput());
  assertEquals(ok.qualifies, true);
  assertEquals(ok.continuationQualified, true);
  assertEquals(ok.corePassCount, 5);
  assertEquals(ok.dataFreshnessLabel, "live");

  const fail = evaluatePennyContinuationV1(
    baseInput({
      observationGenerationId: "gen-fail",
      freshness: freshNearRt(NOW - 60_000),
      velocityWindowTiers: ["NONE", "WEAK", "NONE"],
      aboveVwap: "FALSE",
      holdingVwapAfterReclaim: "FALSE",
      distanceFromHodPct: 20,
      radarHasReAcceleration: "FALSE",
      volumeAccelerationPct: 1,
      radarHasSecondLeg: "FALSE",
    }),
  );
  assertEquals(fail.continuationQualified, false);
  assert(fail.reasons.includes("CONTINUATION_SIGNALS_INSUFFICIENT"));
});

Deno.test("freshness — stale ticker on fresh generation", () => {
  const genMs = NOW - 2_000;
  const staleSym = assessPennySymbolFreshness({
    evaluationClockMs: NOW,
    symbolObservationMs: NOW - 400_000,
    generationSyncMs: genMs,
    generationSyncIso: new Date(genMs).toISOString(),
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
  );
  const pop = evaluatePennyContinuationV1(
    baseInput({
      symbol: "LOWVOL",
      sharesPerMinute10m: 26_000,
      sessionVolumeShares: 600_000,
      dollarVolume: 510_000,
      movePercentVsPriorClose: 5,
    }),
  );
  const ordered = rankPennyContinuationCandidates([pop, liquid]);
  assertEquals(ordered[0]?.symbol, "HIGHVOL");
  assert(comparePennyContinuationRank(liquid, pop) < 0);
});

Deno.test("idempotent duplicate observation and fresh re-evaluation", () => {
  clearPennyContinuationLifecycleState();
  const first = evaluatePennyContinuationV1(baseInput());
  const duplicate = evaluatePennyContinuationV1(baseInput());
  assertEquals(duplicate.continuationQualified, first.continuationQualified);
  assertEquals(duplicate.stableRankingKey, first.stableRankingKey);

  const freshObs = evaluatePennyContinuationV1(
    baseInput({
      observationGenerationId: "gen-2",
      freshness: freshNearRt(NOW - 5_000),
    }),
  );
  assertEquals(freshObs.continuationQualified, true);
});

Deno.test("publication cooldown does not block qualification", () => {
  clearPennyContinuationLifecycleState();
  const a = evaluatePennyContinuationV1(baseInput(), { enforcePublicationCooldown: true });
  const b = evaluatePennyContinuationV1(baseInput(), { enforcePublicationCooldown: true });
  assertEquals(b.continuationQualified, true);
  assertEquals(b.publicationSuppressed, true);
  assertEquals(pennyContinuationMayEmitNotification(b), false);
});

Deno.test("stale observation fails qualification on re-evaluation", () => {
  clearPennyContinuationLifecycleState();
  assertEquals(evaluatePennyContinuationV1(baseInput()).continuationQualified, true);
  const stale = evaluatePennyContinuationV1(
    baseInput({
      freshness: {
        ...freshNearRt(NOW - 500_000),
        generationSyncMs: NOW - 2_000,
        generationSyncIso: new Date(NOW - 2_000).toISOString(),
      },
    }),
  );
  assertEquals(stale.continuationQualified, false);
  assert(stale.reasons.includes("OBSERVATION_STALE"));
});

Deno.test("session rollover evicts prior-session cache", () => {
  clearPennyContinuationLifecycleState();
  evaluatePennyContinuationV1(baseInput({ sessionDate: "2026-11-10" }));
  const nextDay = evaluatePennyContinuationV1(
    baseInput({
      sessionDate: "2026-11-11",
      observationGenerationId: "gen-next",
    }),
  );
  assertEquals(nextDay.continuationQualified, true);
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
  const r = evaluatePennyContinuationV1(baseInput());
  const badge = buildPennyAmInboxBadgePayload(r);
  assertEquals(badge?.kind, "penny_continuation_v1");
  assertEquals(badge?.corePassCount, 5);
});

Deno.test("near-real-time delayed label — not live when lag > 0", () => {
  const r = evaluatePennyContinuationV1(
    baseInput({ freshness: freshNearRt(NOW - 30_000) }),
  );
  assertEquals(r.dataFreshnessLabel, "delayed");
  assertEquals(r.qualifies, true);
});

Deno.test("observation slack constant matches contract", () => {
  assertEquals(PENNY_MAX_OBSERVATION_AGE_MS, 120_000);
});

Deno.test("eligibility — invalid session volume and move", () => {
  assert(
    evaluatePennyContinuationEligibility(baseInput({ sessionVolumeShares: Number.NaN })).reasons.includes(
      "INVALID_SESSION_VOLUME",
    ),
  );
  assert(
    evaluatePennyContinuationEligibility(baseInput({ movePercentVsPriorClose: Number.POSITIVE_INFINITY })).reasons
      .includes("INVALID_MOVE"),
  );
  assert(
    evaluatePennyContinuationEligibility(baseInput({ previousRegularClose: null })).reasons.includes(
      "PRIOR_CLOSE_UNAVAILABLE",
    ),
  );
  assert(
    evaluatePennyContinuationEligibility(baseInput({ dollarVolume: 999_999 })).reasons.includes(
      "DOLLAR_VOLUME_INCONSISTENT",
    ),
  );
});

Deno.test("freshness — generation evidence and future observation", () => {
  const f = assessPennySymbolFreshness({
    evaluationClockMs: NOW,
    symbolObservationMs: NOW + 6 * 60_000,
    generationSyncMs: NOW,
    generationSyncIso: new Date(NOW).toISOString(),
    verifiedExpectedProviderDelayMs: 0,
    dataDeliveryPolicy: "near_real_time",
  });
  assert(f.reasons.includes("INVALID_OBSERVATION_TS"));

  const noGen = assessPennySymbolFreshness({
    evaluationClockMs: NOW,
    symbolObservationMs: NOW,
    verifiedExpectedProviderDelayMs: 0,
    dataDeliveryPolicy: "near_real_time",
  });
  assert(noGen.reasons.includes("GENERATION_EVIDENCE_UNAVAILABLE"));

  const negDelay = assessPennySymbolFreshness({
    evaluationClockMs: NOW,
    symbolObservationMs: NOW,
    generationSyncMs: NOW,
    generationSyncIso: new Date(NOW).toISOString(),
    verifiedExpectedProviderDelayMs: -1,
    dataDeliveryPolicy: "near_real_time",
  });
  assert(negDelay.reasons.includes("PROVIDER_DELAY_UNKNOWN"));
});

Deno.test("CS1 session-ordered windows and CS3 negative HOD", () => {
  const badSession = evaluatePennyCoreSignals(
    baseInput({
      velocityWindows: [
        { tier: "STRONG", sessionDate: "2026-11-10", windowEndMs: NOW - 120_000, completed: true },
        { tier: "STRONG", sessionDate: "2026-11-10", windowEndMs: NOW - 60_000, completed: true },
        { tier: "STRONG", sessionDate: "2026-11-10", windowEndMs: NOW - 30_000, completed: true },
      ],
    }),
  );
  assertEquals(badSession.cs1, "UNKNOWN");

  const negHod = evaluatePennyCoreSignals(baseInput({ distanceFromHodPct: -2 }));
  assertEquals(negHod.cs3, "FAIL");
});

Deno.test("safety — invalidation evidence within same observation minute", () => {
  clearPennyContinuationLifecycleState();
  const ok = evaluatePennyContinuationV1(baseInput());
  assertEquals(ok.continuationQualified, true);
  const invalidated = evaluatePennyContinuationV1(
    baseInput({ catalystInvalidated: "TRUE", spreadPct: 1 }),
  );
  assertEquals(invalidated.continuationQualified, false);
  assert(invalidated.reasons.includes("CATALYST_INVALIDATED"));
});

Deno.test("safety — CS1 tiers-only cannot PASS", () => {
  const cs1 = evaluatePennyCoreSignals(
    baseInput({ velocityWindows: null, velocityWindowTiers: ["MODERATE", "STRONG", "STRONG"] }),
  );
  assertEquals(cs1.cs1, "UNKNOWN");
});

Deno.test("safety — CS1 rejects future and incomplete windows", () => {
  const future = evaluatePennyCoreSignals(
    baseInput({
      velocityWindows: [
        { tier: "MODERATE", sessionDate: "2026-11-11", windowEndMs: NOW - 120_000, completed: true },
        { tier: "STRONG", sessionDate: "2026-11-11", windowEndMs: NOW - 60_000, completed: true },
        { tier: "STRONG", sessionDate: "2026-11-11", windowEndMs: NOW + 60_000, completed: true },
      ],
    }),
  );
  assertEquals(future.cs1, "UNKNOWN");

  const incomplete = evaluatePennyCoreSignals(
    baseInput({
      velocityWindows: [
        { tier: "MODERATE", sessionDate: "2026-11-11", windowEndMs: NOW - 120_000, completed: true },
        { tier: "STRONG", sessionDate: "2026-11-11", windowEndMs: NOW - 60_000, completed: true },
        { tier: "STRONG", sessionDate: "2026-11-11", windowEndMs: NOW - 30_000, completed: false },
      ],
    }),
  );
  assertEquals(incomplete.cs1, "UNKNOWN");
});

Deno.test("safety — duplicate notification suppression retains qualification", () => {
  clearPennyContinuationLifecycleState();
  const first = evaluatePennyContinuationV1(baseInput(), { enforcePublicationCooldown: true });
  assertEquals(first.publicationSuppressed, false);
  assertEquals(buildPennyAmInboxBadgePayload(first) !== null, true);
  const second = evaluatePennyContinuationV1(baseInput(), { enforcePublicationCooldown: true });
  assertEquals(second.continuationQualified, true);
  assertEquals(second.publicationSuppressed, true);
  assertEquals(buildPennyAmInboxBadgePayload(second) !== null, true);
  assertEquals(pennyContinuationMayEmitNotification(second), false);
});

Deno.test("safety — session publication cooldown spans new observation minute and generation", () => {
  clearPennyContinuationLifecycleState();
  evaluatePennyContinuationV1(baseInput(), { enforcePublicationCooldown: true });
  const shifted = evaluatePennyContinuationV1(
    baseInput({
      observationGenerationId: "gen-shifted",
      freshness: freshNearRt(NOW - 15_000),
    }),
    { enforcePublicationCooldown: true },
  );
  assertEquals(shifted.continuationQualified, true);
  assertEquals(shifted.publicationSuppressed, true);
  assert(shifted.publicationIdempotencyKey !== null);
  assertEquals(buildPennyAmInboxBadgePayload(shifted) !== null, true);
});

Deno.test("safety — CS1 requires explicit completed true on each window", () => {
  const missingCompleted = evaluatePennyCoreSignals(
    baseInput({
      velocityWindows: [
        { tier: "MODERATE", sessionDate: "2026-11-11", windowEndMs: NOW - 180_000 },
        { tier: "STRONG", sessionDate: "2026-11-11", windowEndMs: NOW - 120_000, completed: true },
        { tier: "STRONG", sessionDate: "2026-11-11", windowEndMs: NOW - 60_000, completed: true },
      ],
    }),
  );
  assertEquals(missingCompleted.cs1, "UNKNOWN");
});

Deno.test("safety — generation sync ms and iso both required", () => {
  const badMs = assessPennySymbolFreshness({
    evaluationClockMs: NOW,
    symbolObservationMs: NOW,
    generationSyncMs: Number.NaN,
    generationSyncIso: new Date(NOW).toISOString(),
    verifiedExpectedProviderDelayMs: 0,
    dataDeliveryPolicy: "near_real_time",
  });
  assert(badMs.reasons.includes("GENERATION_EVIDENCE_UNAVAILABLE"));
});
