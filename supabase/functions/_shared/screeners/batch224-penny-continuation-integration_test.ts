import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PENNY_DOCUMENTED_PROVIDER_DELAY_MS,
  PENNY_MIN_SHARES_PER_MINUTE,
} from "../config/penny-continuation.config.ts";
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
const POLYGON_OBS_ISO = new Date(NOW - 5_000).toISOString();

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
  const { updated, ...rest } = overrides;
  const updatedNs = updated ?? (NOW - 5_000) * 1_000_000;
  return {
    ticker: "PNY",
    updated: updatedNs,
    day: { c: 0.85, h: 0.9, l: 0.7, v: 2_000_000, o: 0.78 },
    prevDay: { c: 0.787, v: 1_000_000 },
    lastTrade: { p: 0.85 },
    ...rest,
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
    last_price_at: POLYGON_OBS_ISO,
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
    provider_as_of: overrides.provider_as_of ?? POLYGON_OBS_ISO,
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

function qualifyingCandidate(
  overrides: Partial<Parameters<typeof evaluateBoundedPennyContinuationV1>[0][0]> = {},
) {
  return {
    symbol: "PNY",
    polygonTicker: polygonTicker(),
    radarRow: radarRow(),
    spreadPct: 1,
    verifiedVelocityWindows: verifiedVelocityWindows(),
    verifiedSharesPerMinute10m: 40_000,
    catalystVerified: "TRUE" as const,
    catalystAgeHours: 12,
    ...overrides,
  };
}

Deno.test("integration — matching Polygon and Radar qualifies end-to-end", () => {
  clearPennyContinuationLifecycleState();
  const out = evaluateBoundedPennyContinuationV1(
    [qualifyingCandidate()],
    integrationCtx(),
    { includeBadges: true },
  );
  assertEquals(out.rankedQualified.length, 1);
  assertEquals(out.rankedQualified[0].continuationQualified, true);
  assertEquals(out.rankedQualified[0].corePassCount, 5);
  assertEquals(out.badges.length, 1);
  assertEquals(out.badges[0]?.symbol, "PNY");
  assertEquals(out.badges[0]?.kind, "penny_continuation_v1");
});

Deno.test("adapter — verified ten-minute velocity accepted for eligibility", () => {
  const adapted = adaptDiscoveredCandidateToPennyInput(
    qualifyingCandidate(),
    integrationCtx(),
  );
  assert(adapted.input);
  assertEquals(adapted.input.sharesPerMinute10m, 40_000);
  assertEquals(adapted.diagnostics?.volumeVelocity5mSharesPerMinute, 40_000);
});

Deno.test("integration — five-minute Radar velocity alone fails ten-minute gate", () => {
  clearPennyContinuationLifecycleState();
  const out = evaluateBoundedPennyContinuationV1([{
    ...qualifyingCandidate(),
    verifiedSharesPerMinute10m: undefined,
  }], integrationCtx());
  const rej = out.rejections.find((r) => r.symbol === "PNY");
  assert(rej?.result);
  assertEquals(rej.result.continuationQualified, false);
  assert(rej.result.reasons.includes("VELOCITY_LOW"));
});

Deno.test("adapter — conflicting polygon ticker symbol rejected", () => {
  const adapted = adaptDiscoveredCandidateToPennyInput(
    {
      symbol: "PNY",
      polygonTicker: polygonTicker({ ticker: "OTHER" }),
      radarRow: radarRow(),
    },
    integrationCtx(),
  );
  assertEquals(adapted.input, null);
  assert(adapted.adapterReasons.includes("SYMBOL_MISMATCH"));
});

Deno.test("adapter — same-date PM Radar vs RTH Polygon session mismatch", () => {
  const adapted = adaptDiscoveredCandidateToPennyInput(
    {
      symbol: "PNY",
      polygonTicker: polygonTicker(),
      radarRow: radarRow({ session_kind: "pre-market" }),
    },
    integrationCtx(),
  );
  assertEquals(adapted.input, null);
  assert(adapted.adapterReasons.includes("SESSION_KIND_MISMATCH"));
});

Deno.test("adapter — stale Radar with fresh Polygon observation desync", () => {
  const adapted = adaptDiscoveredCandidateToPennyInput(
    {
      symbol: "PNY",
      polygonTicker: polygonTicker(),
      radarRow: radarRow({
        provider_as_of: new Date(NOW - 600_000).toISOString(),
      }),
    },
    integrationCtx(),
  );
  assertEquals(adapted.input, null);
  assert(adapted.adapterReasons.includes("RADAR_POLYGON_OBSERVATION_DESYNC"));
});

Deno.test("integration — overnight caller override rejected", () => {
  const out = evaluateBoundedPennyContinuationV1(
    [qualifyingCandidate()],
    integrationCtx({ observationSessionKind: "overnight" }),
  );
  assertEquals(out.rankedQualified.length, 0);
  const rej = out.rejections.find((r) => r.symbol === "PNY");
  assert(rej?.adapterReasons.includes("OBSERVATION_SESSION_OVERRIDE_REJECTED"));
});

Deno.test("adapter — polygon observation timestamp not generation sync", () => {
  const adapted = adaptDiscoveredCandidateToPennyInput(
    { symbol: "PNY", polygonTicker: polygonTicker(), spreadPct: 1, verifiedSharesPerMinute10m: 40_000 },
    integrationCtx(),
  );
  assert(adapted.input);
  assertEquals(adapted.input.freshness.symbolObservationMs, NOW - 5_000);
  assertEquals(adapted.input.freshness.generationSyncMs, GEN_MS);
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
    qualifyingCandidate({ polygonTicker: t }),
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

Deno.test("adapter — radar VWAP maps when clocks align; no CS1 fabrication", () => {
  const facts = extractPennyFactsFromRadarV22Row(radarRow());
  assertEquals(facts.aboveVwap, "TRUE");
  assertEquals(facts.volumeVelocity5mSharesPerMinute, 40_000);

  const adapted = adaptDiscoveredCandidateToPennyInput(
    qualifyingCandidate(),
    integrationCtx(),
  );
  assert(adapted.input);
  assertEquals(adapted.input.velocityWindows?.length, 3);
  assertEquals(adapted.input.aboveVwap, "TRUE");
  assertEquals(adapted.diagnostics?.radarStructureEvidenceAligned, true);
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

Deno.test("adapter — fifteen-minute delayed feed preserved and qualifies", () => {
  clearPennyContinuationLifecycleState();
  const obs = NOW - 600_000;
  const out = evaluateBoundedPennyContinuationV1([{
    ...qualifyingCandidate(),
    polygonTicker: polygonTicker({ updated: obs * 1_000_000 }),
    radarRow: radarRow({ provider_as_of: new Date(obs).toISOString() }),
  }], integrationCtx({
    verifiedExpectedProviderDelayMs: PENNY_DOCUMENTED_PROVIDER_DELAY_MS,
    dataDeliveryPolicy: "documented_delayed",
  }), { includeBadges: true });
  assertEquals(out.rankedQualified.length, 1);
  assertEquals(out.rankedQualified[0].continuationQualified, true);
  assertEquals(out.rankedQualified[0].dataFreshnessLabel, "delayed");
});

Deno.test("integration — volume-first ordering with two qualifiers", () => {
  clearPennyContinuationLifecycleState();
  const highVol = polygonTicker({ ticker: "AAA", day: { c: 0.85, h: 0.9, l: 0.7, v: 5_000_000, o: 0.78 } });
  const lowVol = polygonTicker({ ticker: "BBB", day: { c: 0.85, h: 0.9, l: 0.7, v: 1_000_000, o: 0.78 } });
  const windows = verifiedVelocityWindows();
  const base = {
    spreadPct: 1,
    verifiedVelocityWindows: windows,
    verifiedSharesPerMinute10m: PENNY_MIN_SHARES_PER_MINUTE + 5_000,
    catalystVerified: "TRUE" as const,
    catalystAgeHours: 1,
  };
  const syncIso = POLYGON_OBS_ISO;
  const out = evaluateBoundedPennyContinuationV1([
    {
      symbol: "BBB",
      polygonTicker: lowVol,
      radarRow: radarRow({ symbol: "BBB", provider_as_of: syncIso }),
      ...base,
    },
    {
      symbol: "AAA",
      polygonTicker: highVol,
      radarRow: radarRow({ symbol: "AAA", provider_as_of: syncIso }),
      ...base,
    },
  ], integrationCtx(), { includeBadges: true });
  assertEquals(out.rankedQualified.length, 2);
  assert(
    (out.rankedQualified[0].rankKeys.sessionVolume ?? 0) >=
      (out.rankedQualified[1].rankKeys.sessionVolume ?? 0),
  );
});

Deno.test("integration — duplicate symbols deduped", () => {
  const out = evaluateBoundedPennyContinuationV1([
    qualifyingCandidate(),
    qualifyingCandidate({ symbol: "pny" }),
  ], integrationCtx());
  assertEquals(out.duplicateSymbolsSkipped, ["PNY"]);
});

Deno.test("integration — stale symbol observation fails qualification", () => {
  clearPennyContinuationLifecycleState();
  const staleObs = NOW - 500_000;
  const { radarRow: _r, ...polygonOnly } = qualifyingCandidate();
  const out = evaluateBoundedPennyContinuationV1([{
    ...polygonOnly,
    polygonTicker: polygonTicker({ updated: staleObs * 1_000_000 }),
  }], integrationCtx());
  const row = out.rejections.find((r) => r.symbol === "PNY");
  assert(row?.result);
  assert(row.result.reasons.includes("OBSERVATION_STALE"));
});

Deno.test("integration — missing CS1 windows yields non-qualification", () => {
  clearPennyContinuationLifecycleState();
  const out = evaluateBoundedPennyContinuationV1([{
    ...qualifyingCandidate(),
    verifiedVelocityWindows: undefined,
    radarRow: radarRow({
      radar_engine_events: [],
      vwap_side: "unknown",
      distance_from_hod_pct: 20,
      volume_acceleration_pct: 0,
    }),
    catalystVerified: "FALSE",
  }], integrationCtx());
  const rej = out.rejections.find((r) => r.symbol === "PNY");
  assert(rej?.result);
  assertEquals(rej.result.continuationQualified, false);
  assertEquals(rej.result.coreSignals.cs1, "UNKNOWN");
});

Deno.test("integration — publication cooldown preserves qualification and badges", () => {
  clearPennyContinuationLifecycleState();
  const candidate = qualifyingCandidate();
  const first = evaluateBoundedPennyContinuationV1([candidate], integrationCtx(), {
    enforcePublicationCooldown: true,
    includeBadges: true,
  });
  const second = evaluateBoundedPennyContinuationV1([candidate], integrationCtx(), {
    enforcePublicationCooldown: true,
    includeBadges: true,
  });
  assertEquals(first.rankedQualified.length, 1);
  assertEquals(second.rankedQualified.length, 1);
  assertEquals(second.rankedQualified[0].publicationSuppressed, true);
  assertEquals(second.rankedQualified[0].continuationQualified, true);
  assertEquals(second.badges.length, 1);
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
