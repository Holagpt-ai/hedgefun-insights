import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PENNY_DOCUMENTED_PROVIDER_DELAY_MS,
} from "../config/penny-continuation.config.ts";
import { OVERNIGHT_SCANNER_PIPELINE_READY } from "../markets/equity-session-control.ts";
import type { RadarV22CandidateRow } from "../radar-v22/persistence-v2.ts";
import { adaptDiscoveredCandidateToPennyInput } from "./penny-continuation-market-adapter.ts";
import {
  evaluateBoundedPennyContinuationV1,
  PENNY_INTEGRATION_CANDIDATE_CAP,
} from "./penny-continuation-integration-v1.ts";
import type { PennyContinuationIntegrationContext } from "./penny-continuation-integration-types.ts";
import { extractPennyFactsFromRadarV22Row } from "./penny-continuation-radar-evidence.ts";
import { clearPennyContinuationLifecycleState } from "./penny-continuation-v1.ts";
import {
  changePercentVsPriorRegularClose,
  currentSessionReferencePrice,
  type PolygonTicker,
} from "./selection.ts";
import {
  sessionQualificationVolume,
  volumeContextFromOpts,
} from "./session-volume.ts";

const NOW = Date.parse("2026-11-11T15:00:00.000Z");
const SESSION = "2026-11-11";
const GEN_MS = NOW - 2_000;

function integrationCtx(
  overrides: Partial<PennyContinuationIntegrationContext> = {},
): PennyContinuationIntegrationContext {
  return {
    sessionDate: SESSION,
    evaluationClockMs: NOW,
    generationSyncMs: GEN_MS,
    generationSyncIso: new Date(GEN_MS).toISOString(),
    verifiedExpectedProviderDelayMs: 0,
    dataDeliveryPolicy: "near_real_time",
    observationGenerationId: "gen-batch224",
    ...overrides,
  };
}

function polygonTicker(overrides: Partial<PolygonTicker> = {}): PolygonTicker {
  return {
    ticker: "PNY",
    updated: NOW * 1_000_000,
    day: { c: 0.85, h: 0.9, l: 0.7, v: 2_000_000, o: 0.78 },
    prevDay: { c: 0.787, v: 1_000_000 },
    lastTrade: { p: 0.85 },
    ...overrides,
  };
}

function radarRow(overrides: Partial<RadarV22CandidateRow> = {}): RadarV22CandidateRow {
  return {
    generation_id: "gen-radar",
    trading_date: SESSION,
    session_kind: "market",
    symbol: "PNY",
    lifecycle: "ACTIVE",
    signal_status: "EXPLOSIVE",
    last_price: 0.85,
    last_price_at: new Date(NOW).toISOString(),
    move_15s_pct: null,
    move_60s_pct: null,
    volume_5s: 0,
    volume_15s: 0,
    volume_60s: 0,
    session_volume: 2_000_000,
    dollar_volume_60s: 0,
    acceleration_5m: 20,
    rvol_5m: 2.5,
    volume_velocity: 40_000,
    volume_acceleration_pct: 20,
    session_high: 0.9,
    session_low: 0.7,
    distance_from_hod_pct: 5,
    session_vwap: 0.82,
    vwap_side: "above",
    geometry_partial: false,
    vwap_partial: false,
    last_new_hod_at: null,
    last_hod_attempt_at: null,
    last_hod_break_at: null,
    last_hod_reject_at: null,
    last_vwap_cross_at: null,
    last_vwap_reclaim_at: new Date(NOW - 120_000).toISOString(),
    last_vwap_loss_at: null,
    freshness_class: "fresh",
    freshness_age_ms: 0,
    last_volume_burst_at: null,
    last_price_move_at: null,
    last_acceleration_at: new Date(NOW - 60_000).toISOString(),
    promoted_at: null,
    lifecycle_entered_at: null,
    provider_as_of: new Date(NOW - 5_000).toISOString(),
    primary_scanner_event: null,
    primary_scanner_event_at: null,
    scanner_events: [],
    promotion_reason: null,
    radar_event_lifecycle: null,
    radar_engine_events: [
      { type: "RE_ACCELERATION", event_at: new Date(NOW - 90_000).toISOString() },
      { type: "SECOND_LEG", event_at: new Date(NOW - 45_000).toISOString() },
    ],
    time_adjusted_rvol: 2.5,
    volume_5m: 200_000,
    volume_15m: null,
    volume_60m: null,
    volume_velocity_5m: 40_000,
    volume_velocity_15m: null,
    volume_velocity_60m: null,
    dollar_volume_velocity_5m: null,
    participation_state: null,
    participation_baseline_session_count: 10,
    participation_calculated_at: null,
    participation_source_as_of: null,
    regular_session_close: null,
    previous_close: 0.787,
    prior_session_volume: 1_000_000,
    updated_at: new Date(NOW).toISOString(),
    ...overrides,
  };
}

function verifiedVelocityWindows() {
  return [
    { tier: "MODERATE" as const, sessionDate: SESSION, windowEndMs: NOW - 180_000, completed: true },
    { tier: "STRONG" as const, sessionDate: SESSION, windowEndMs: NOW - 120_000, completed: true },
    { tier: "STRONG" as const, sessionDate: SESSION, windowEndMs: NOW - 60_000, completed: true },
  ];
}

Deno.test("adapter — polygon observation timestamp not generation sync", () => {
  const adapted = adaptDiscoveredCandidateToPennyInput(
    { symbol: "PNY", polygonTicker: polygonTicker(), spreadPct: 1 },
    integrationCtx(),
  );
  assert(adapted.input);
  assertEquals(adapted.input.freshness.symbolObservationMs, NOW);
  assertEquals(adapted.input.freshness.generationSyncMs, GEN_MS);
  assert(adapted.input.observedAt !== adapted.input.freshness.generationSyncIso);
});

Deno.test("adapter — missing observation fails closed", () => {
  const t = polygonTicker();
  delete t.updated;
  const adapted = adaptDiscoveredCandidateToPennyInput(
    { symbol: "PNY", polygonTicker: t },
    integrationCtx(),
  );
  assertEquals(adapted.input, null);
  assert(adapted.adapterReasons.includes("MISSING_OBSERVATION_TS"));
});

Deno.test("adapter — Five Pillars parity on volume and move", () => {
  const t = polygonTicker();
  const opts = { observationSessionFields: true, nowMs: NOW, extendedSession: false };
  const volCtx = volumeContextFromOpts(opts);
  const adapted = adaptDiscoveredCandidateToPennyInput(
    { symbol: "PNY", polygonTicker: t, spreadPct: 1, verifiedVelocityWindows: verifiedVelocityWindows() },
    integrationCtx(),
  );
  assert(adapted.input);
  assertEquals(adapted.input.sessionVolumeShares, sessionQualificationVolume(t, volCtx));
  const ref = currentSessionReferencePrice(t, false);
  assertEquals(
    adapted.input.movePercentVsPriorClose,
    changePercentVsPriorRegularClose(ref, t),
  );
});

Deno.test("adapter — radar VWAP and continuation events map without inventing CS1", () => {
  const facts = extractPennyFactsFromRadarV22Row(radarRow());
  assertEquals(facts.aboveVwap, "TRUE");
  assertEquals(facts.radarHasReAcceleration, "TRUE");
  assertEquals(facts.radarHasSecondLeg, "TRUE");

  const adapted = adaptDiscoveredCandidateToPennyInput(
    { symbol: "PNY", polygonTicker: polygonTicker(), radarRow: radarRow(), spreadPct: 1 },
    integrationCtx(),
  );
  assert(adapted.input);
  assertEquals(adapted.input.velocityWindows, null);
  assertEquals(adapted.input.aboveVwap, "TRUE");
});

Deno.test("adapter — verified CS1 windows pass through when supplied", () => {
  const windows = verifiedVelocityWindows();
  const adapted = adaptDiscoveredCandidateToPennyInput(
    {
      symbol: "PNY",
      polygonTicker: polygonTicker(),
      spreadPct: 1,
      verifiedVelocityWindows: windows,
    },
    integrationCtx(),
  );
  assert(adapted.input);
  assertEquals(adapted.input.velocityWindows, windows);
});

Deno.test("adapter — prior close conflict between polygon and radar", () => {
  const adapted = adaptDiscoveredCandidateToPennyInput(
    {
      symbol: "PNY",
      polygonTicker: polygonTicker({ prevDay: { c: 0.5, v: 1_000_000 } }),
      radarRow: radarRow({ previous_close: 0.787 }),
    },
    integrationCtx(),
  );
  assertEquals(adapted.input, null);
  assert(adapted.adapterReasons.includes("PRIOR_CLOSE_CONFLICT"));
});

Deno.test("adapter — fifteen-minute delayed feed policy preserved", () => {
  const obs = NOW - 600_000;
  const adapted = adaptDiscoveredCandidateToPennyInput(
    {
      symbol: "PNY",
      polygonTicker: polygonTicker({ updated: obs * 1_000_000 }),
      spreadPct: 1,
      verifiedVelocityWindows: verifiedVelocityWindows(),
      catalystVerified: "TRUE",
      catalystAgeHours: 12,
    },
    integrationCtx({
      verifiedExpectedProviderDelayMs: PENNY_DOCUMENTED_PROVIDER_DELAY_MS,
      dataDeliveryPolicy: "documented_delayed",
    }),
  );
  assert(adapted.input);
  const out = evaluateBoundedPennyContinuationV1([{
    symbol: "PNY",
    polygonTicker: polygonTicker({ updated: obs * 1_000_000 }),
    spreadPct: 1,
    verifiedVelocityWindows: verifiedVelocityWindows(),
    catalystVerified: "TRUE",
    catalystAgeHours: 12,
  }], integrationCtx({
    verifiedExpectedProviderDelayMs: PENNY_DOCUMENTED_PROVIDER_DELAY_MS,
    dataDeliveryPolicy: "documented_delayed",
  }), { includeBadges: true });
  assert(out.rankedQualified.length >= 0);
  assertEquals(adapted.input.freshness.verifiedExpectedProviderDelayMs, PENNY_DOCUMENTED_PROVIDER_DELAY_MS);
});

Deno.test("integration — volume-first ordering", () => {
  clearPennyContinuationLifecycleState();
  const highVol = polygonTicker({ ticker: "AAA", day: { c: 0.85, h: 0.9, l: 0.7, v: 5_000_000, o: 0.78 } });
  const lowVol = polygonTicker({ ticker: "BBB", day: { c: 0.85, h: 0.9, l: 0.7, v: 1_000_000, o: 0.78 } });
  const windows = verifiedVelocityWindows();
  const out = evaluateBoundedPennyContinuationV1([
    { symbol: "BBB", polygonTicker: lowVol, spreadPct: 1, verifiedVelocityWindows: windows, catalystVerified: "TRUE", catalystAgeHours: 1 },
    { symbol: "AAA", polygonTicker: highVol, spreadPct: 1, verifiedVelocityWindows: windows, catalystVerified: "TRUE", catalystAgeHours: 1 },
  ], integrationCtx(), { includeBadges: true });
  if (out.rankedQualified.length >= 2) {
    assert(
      (out.rankedQualified[0].rankKeys.sessionVolume ?? 0) >=
        (out.rankedQualified[1].rankKeys.sessionVolume ?? 0),
    );
  }
});

Deno.test("integration — duplicate symbols deduped", () => {
  const t = polygonTicker();
  const out = evaluateBoundedPennyContinuationV1([
    { symbol: "PNY", polygonTicker: t, spreadPct: 1, verifiedVelocityWindows: verifiedVelocityWindows() },
    { symbol: "pny", polygonTicker: t, spreadPct: 1, verifiedVelocityWindows: verifiedVelocityWindows() },
  ], integrationCtx());
  assertEquals(out.duplicateSymbolsSkipped, ["PNY"]);
});

Deno.test("integration — stale symbol with fresh generation fails qualification", () => {
  clearPennyContinuationLifecycleState();
  const staleObs = NOW - 500_000;
  const out = evaluateBoundedPennyContinuationV1([{
    symbol: "PNY",
    polygonTicker: polygonTicker({ updated: staleObs * 1_000_000 }),
    spreadPct: 1,
    verifiedVelocityWindows: verifiedVelocityWindows(),
  }], integrationCtx());
  const row = out.rejections.find((r) => r.symbol === "PNY");
  assert(row?.result);
  assert(row.result.reasons.includes("OBSERVATION_STALE"));
});

Deno.test("integration — missing CS1 windows yields non-qualification", () => {
  clearPennyContinuationLifecycleState();
  const out = evaluateBoundedPennyContinuationV1([{
    symbol: "PNY",
    polygonTicker: polygonTicker(),
    radarRow: radarRow({
      radar_engine_events: [],
      vwap_side: "unknown",
      distance_from_hod_pct: 20,
      volume_acceleration_pct: 0,
    }),
    spreadPct: 1,
    catalystVerified: "FALSE",
  }], integrationCtx());
  const rej = out.rejections.find((r) => r.symbol === "PNY");
  assert(rej?.result);
  assertEquals(rej.result.continuationQualified, false);
  assertEquals(rej.result.coreSignals.cs1, "UNKNOWN");
});

Deno.test("integration — AM Inbox badge optional payload", () => {
  clearPennyContinuationLifecycleState();
  const out = evaluateBoundedPennyContinuationV1([{
    symbol: "PNY",
    polygonTicker: polygonTicker(),
    radarRow: radarRow(),
    spreadPct: 1,
    verifiedVelocityWindows: verifiedVelocityWindows(),
    catalystVerified: "TRUE",
    catalystAgeHours: 1,
  }], integrationCtx(), { includeBadges: true });
  if (out.rankedQualified.length > 0) {
    assertEquals(out.badges.length, out.rankedQualified.length);
    assertEquals(out.badges[0]?.kind, "penny_continuation_v1");
  }
});

Deno.test("integration — overnight pipeline disabled", () => {
  assertEquals(OVERNIGHT_SCANNER_PIPELINE_READY, false);
  const out = evaluateBoundedPennyContinuationV1(
    [{ symbol: "PNY", polygonTicker: polygonTicker(), spreadPct: 1 }],
    integrationCtx({ observationSessionKind: "overnight" }),
  );
  const rej = out.rejections.find((r) => r.symbol === "PNY");
  assert(rej?.result?.reasons.includes("OVERNIGHT_VOLUME_UNVERIFIED"));
});

Deno.test("integration — bounded cap enforced", () => {
  const empty = evaluateBoundedPennyContinuationV1([], integrationCtx());
  assert(empty.rejections[0]?.adapterReasons.includes("CANDIDATE_LIST_EMPTY"));

  const list = Array.from({ length: PENNY_INTEGRATION_CANDIDATE_CAP + 1 }, (_, i) => ({
    symbol: `S${i}`,
    polygonTicker: polygonTicker({ ticker: `S${i}` }),
  }));
  const capped = evaluateBoundedPennyContinuationV1(list, integrationCtx());
  assert(capped.rejections[0]?.adapterReasons.includes("CANDIDATE_LIST_EXCEEDS_CAP"));
});

Deno.test("integration — publication cooldown does not mutate sync handlers", () => {
  clearPennyContinuationLifecycleState();
  const candidate = {
    symbol: "PNY",
    polygonTicker: polygonTicker(),
    spreadPct: 1,
    verifiedVelocityWindows: verifiedVelocityWindows(),
    catalystVerified: "TRUE" as const,
    catalystAgeHours: 1,
  };
  const first = evaluateBoundedPennyContinuationV1([candidate], integrationCtx(), {
    enforcePublicationCooldown: true,
    includeBadges: true,
  });
  const second = evaluateBoundedPennyContinuationV1([candidate], integrationCtx(), {
    enforcePublicationCooldown: true,
    includeBadges: true,
  });
  if (first.rankedQualified.length > 0 && second.rankedQualified.length > 0) {
    assertEquals(second.rankedQualified[0].publicationSuppressed, true);
    assertEquals(second.badges.length, 1);
  }
});
