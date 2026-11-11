import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateBoundedPennyContinuationV1,
} from "./penny-continuation-integration-v1.ts";
import type { PennyContinuationIntegrationContext } from "./penny-continuation-integration-types.ts";
import { clearPennyContinuationLifecycleState } from "./penny-continuation-v1.ts";
import {
  PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION,
} from "./penny-continuation-workflow-handoff-types.ts";
import {
  projectPennyWorkflowHandoffFromResult,
  projectPennyWorkflowHandoffsFromIntegration,
  resolvePennyQualificationEvidenceKind,
} from "./penny-continuation-workflow-handoff.ts";
import type { PennyContinuationResult } from "./penny-continuation-types.ts";
import type { PolygonTicker } from "./selection.ts";
import type { RadarV22CandidateRow } from "../radar-v22/persistence-v2.ts";

const NOW = Date.parse("2026-11-11T15:00:00.000Z");
const SESSION = "2026-11-11";
const GEN_MS = NOW - 2_000;
const POLYGON_OBS_ISO = new Date(NOW - 5_000).toISOString();

function integrationCtx(): PennyContinuationIntegrationContext {
  return {
    sessionDate: SESSION,
    evaluationClockMs: NOW,
    generationSyncMs: GEN_MS,
    generationSyncIso: new Date(GEN_MS).toISOString(),
    verifiedExpectedProviderDelayMs: 0,
    dataDeliveryPolicy: "near_real_time",
    observationGenerationId: "gen-batch225",
  };
}

function polygonTicker(): PolygonTicker {
  return {
    ticker: "PNY",
    updated: (NOW - 5_000) * 1_000_000,
    day: { c: 0.85, h: 0.9, l: 0.7, v: 2_000_000, o: 0.78 },
    prevDay: { c: 0.787, v: 1_000_000 },
    lastTrade: { p: 0.85 },
  };
}

function radarRow(): RadarV22CandidateRow {
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
    provider_as_of: POLYGON_OBS_ISO,
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
  };
}

function verifiedVelocityWindows() {
  return [
    { tier: "MODERATE" as const, sessionDate: SESSION, windowEndMs: NOW - 180_000, completed: true },
    { tier: "STRONG" as const, sessionDate: SESSION, windowEndMs: NOW - 120_000, completed: true },
    { tier: "STRONG" as const, sessionDate: SESSION, windowEndMs: NOW - 60_000, completed: true },
  ];
}

function qualifiedIntegration() {
  clearPennyContinuationLifecycleState();
  return evaluateBoundedPennyContinuationV1([{
    symbol: "PNY",
    polygonTicker: polygonTicker(),
    radarRow: radarRow(),
    spreadPct: 1,
    verifiedVelocityWindows: verifiedVelocityWindows(),
    verifiedSharesPerMinute10m: 40_000,
    catalystVerified: "TRUE",
    catalystAgeHours: 12,
  }], integrationCtx(), { includeBadges: true });
}

Deno.test("Batch 225 — qualified integration projects versioned handoff", () => {
  const integration = qualifiedIntegration();
  const bundle = projectPennyWorkflowHandoffsFromIntegration(integration, {
    amSessionDate: SESSION,
  });
  assertEquals(bundle.handoff_version, PENNY_CONTINUATION_WORKFLOW_HANDOFF_VERSION);
  assertEquals(bundle.handoffs.length, 1);
  const h = bundle.handoffs[0];
  assertEquals(h.symbol, "PNY");
  assertEquals(h.sourceSessionDate, SESSION);
  assertEquals(h.corePassCount, 5);
  assertEquals(h.rankKeys.sessionVolume, 2_000_000);
  assertEquals(h.badge?.kind, "penny_continuation_v1");
  assertEquals(h.publicationIdempotencyKey, integration.rankedQualified[0].publicationIdempotencyKey);
  assertEquals(h.qualificationEvidenceKind, "live_market");
  assert(h.symbolObservationIso !== null);
});

Deno.test("Batch 225 — unqualified result produces no handoff", () => {
  const integration = qualifiedIntegration();
  const stale: PennyContinuationResult = {
    ...integration.rankedQualified[0],
    continuationQualified: false,
    qualifies: false,
  };
  const projected = projectPennyWorkflowHandoffFromResult(stale, {
    integration_version: integration.integration_version,
    captureIso: integration.evaluatedAt,
    integrationSessionDate: integration.sessionDate,
  });
  assertEquals(projected, null);
});

Deno.test("Batch 225 — prior-session capture label", () => {
  assertEquals(
    resolvePennyQualificationEvidenceKind({
      sourceSessionDate: SESSION,
      integrationSessionDate: SESSION,
      amSessionDate: "2026-11-12",
    }),
    "prior_session_capture",
  );
});

Deno.test("Batch 225 — publication suppression preserved on handoff", () => {
  const integration = qualifiedIntegration();
  const suppressed = {
    ...integration.rankedQualified[0],
    publicationSuppressed: true,
  };
  const handoff = projectPennyWorkflowHandoffFromResult(suppressed, {
    integration_version: integration.integration_version,
    captureIso: integration.evaluatedAt,
    integrationSessionDate: integration.sessionDate,
  });
  assert(handoff);
  assertEquals(handoff.publicationSuppressed, true);
  assert(handoff.badge !== null);
});
