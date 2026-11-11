/**
 * Verified Polygon screener snapshot → PennyContinuationInput (Batch 224).
 * Never substitutes generation sync time for symbol observation time.
 */

import { OVERNIGHT_SCANNER_PIPELINE_READY } from "../markets/equity-session-control.ts";
import {
  buildSnapshotFromPolygonTicker,
  gapPercentFromVerifiedInputs,
  overlayVerifiedPreviousCloseOnTicker,
  type VerifiedPreviousCloseOverlay,
} from "./normalized-market-snapshot.ts";
import { extractPennyFactsFromRadarV22Row } from "./penny-continuation-radar-evidence.ts";
import type {
  PennyContinuationAdapterOutcome,
  PennyContinuationDiscoveredCandidate,
  PennyContinuationIntegrationContext,
  PennyIntegrationAdapterReason,
} from "./penny-continuation-integration-types.ts";
import type { PennyContinuationInput } from "./penny-continuation-types.ts";
import {
  changePercentVsPriorRegularClose,
  currentSessionReferencePrice,
  extendedQuoteSemanticsForTicker,
  gapSuppressedOnlyBySplitScaleGuard,
  normalizeSymbol,
  parseProviderAsOf,
  previousRegularClose,
  type PolygonTicker,
  type TabSelectionOpts,
} from "./selection.ts";
import { qualificationObservationKind } from "./session-sync-context.ts";
import { computeSignedMovePercentVsPriorClose } from "./penny-continuation-eligibility.ts";

const PRIOR_CLOSE_RELATIVE_TOLERANCE = 0.02;

function pushReason(
  reasons: PennyIntegrationAdapterReason[],
  reason: PennyIntegrationAdapterReason,
): void {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function observationMsFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function buildVerifiedOverlay(
  radarPreviousClose: number | null,
  symbol: string,
  priorSessionVolume: number | null,
): ReadonlyMap<string, VerifiedPreviousCloseOverlay> | undefined {
  if (!radarPreviousClose || !(radarPreviousClose > 0)) return undefined;
  const map = new Map<string, VerifiedPreviousCloseOverlay>();
  map.set(symbol, {
    symbol,
    previousClose: radarPreviousClose,
    priorSessionVolume,
    source: "radar_v22_candidate",
  });
  return map;
}

function priorClosesConflict(
  polygonPrev: number | null,
  radarPrev: number | null,
): boolean {
  if (polygonPrev === null || radarPrev === null) return false;
  if (!(polygonPrev > 0) || !(radarPrev > 0)) return false;
  const rel = Math.abs(polygonPrev - radarPrev) / polygonPrev;
  return rel > PRIOR_CLOSE_RELATIVE_TOLERANCE;
}

export function adaptDiscoveredCandidateToPennyInput(
  candidate: PennyContinuationDiscoveredCandidate,
  ctx: PennyContinuationIntegrationContext,
): PennyContinuationAdapterOutcome {
  const adapterReasons: PennyIntegrationAdapterReason[] = [];
  const symbol = normalizeSymbol(candidate.symbol);
  if (!symbol) {
    return { input: null, adapterReasons: ["INVALID_SYMBOL"] };
  }

  const syncNowMs = ctx.syncNowMs ?? ctx.evaluationClockMs;
  const tabOpts: TabSelectionOpts = {
    extendedSession: ctx.extendedSession,
    observationSessionFields: true,
    nowMs: syncNowMs,
  };

  const radar = candidate.radarRow
    ? extractPennyFactsFromRadarV22Row(candidate.radarRow)
    : null;

  if (radar && radar.tradingDate !== ctx.sessionDate) {
    pushReason(adapterReasons, "SESSION_DATE_CONFLICT");
  }
  let ticker: PolygonTicker | null = candidate.polygonTicker ?? null;
  if (ticker && radar?.previousRegularClose) {
    const overlay = buildVerifiedOverlay(
      radar.previousRegularClose,
      symbol,
      candidate.radarRow?.prior_session_volume ?? null,
    );
    if (overlay) {
      ticker = overlayVerifiedPreviousCloseOnTicker(ticker, overlay);
    }
  }

  if (!ticker && !radar) {
    pushReason(adapterReasons, "MISSING_MARKET_EVIDENCE");
    return { input: null, adapterReasons };
  }

  const polygonObsIso = ticker
    ? parseProviderAsOf(ticker.updated, syncNowMs)
    : null;
  const polygonObsMs = observationMsFromIso(polygonObsIso);
  const radarObsMs = radar?.providerAsOfMs ?? null;
  const symbolObservationMs = polygonObsMs ?? radarObsMs;
  const observedAt = polygonObsIso ?? radar?.providerAsOfIso ?? null;

  if (symbolObservationMs === null || observedAt === null) {
    pushReason(adapterReasons, "MISSING_OBSERVATION_TS");
    return { input: null, adapterReasons };
  }

  const polygonPrev = ticker ? previousRegularClose(ticker) : null;
  if (priorClosesConflict(polygonPrev, radar?.previousRegularClose ?? null)) {
    pushReason(adapterReasons, "PRIOR_CLOSE_CONFLICT");
  }

  const extended =
    ticker !== null
      ? extendedQuoteSemanticsForTicker(ticker, tabOpts)
      : ctx.extendedSession ?? false;
  if (extended === null) {
    pushReason(adapterReasons, "MISSING_MARKET_EVIDENCE");
    return { input: null, adapterReasons };
  }

  const snapshot = ticker
    ? buildSnapshotFromPolygonTicker(ticker, {
      symbol,
      extendedSession: extended,
      nowMs: syncNowMs,
      providerTimestamp: polygonObsIso,
    })
    : null;

  const price = snapshot?.price ?? radar?.price ?? null;
  const previousRegularCloseValue = snapshot?.previousClose ??
    radar?.previousRegularClose ??
    null;

  const derivedObservationKind = qualificationObservationKind(
    symbolObservationMs,
    syncNowMs,
    null,
    OVERNIGHT_SCANNER_PIPELINE_READY,
  );
  const observationKind = ctx.observationSessionKind ?? derivedObservationKind ?? null;

  const sessionVolume = snapshot?.volume ?? radar?.sessionVolumeShares ?? null;
  const dollarVolume = snapshot?.dollarVolume ?? radar?.dollarVolume ?? null;

  const refPrice = ticker
    ? currentSessionReferencePrice(ticker, extended)
    : price;
  const moveFromPolygon = ticker && refPrice !== null
    ? changePercentVsPriorRegularClose(refPrice, ticker)
    : null;
  const movePercent =
    moveFromPolygon ??
    (price !== null && previousRegularCloseValue !== null
      ? computeSignedMovePercentVsPriorClose(price, previousRegularCloseValue)
      : null) ??
    (price !== null && previousRegularCloseValue !== null
      ? gapPercentFromVerifiedInputs(price, previousRegularCloseValue)
      : null);

  const impliesSplitScale = ticker
    ? gapSuppressedOnlyBySplitScaleGuard(ticker, tabOpts)
    : false;

  const velocityWindows = candidate.verifiedVelocityWindows ?? null;
  const velocityWindowTiers = velocityWindows && velocityWindows.length >= 3
    ? velocityWindows.slice(-3).map((w) => w.tier)
    : null;

  const sharesPerMinute10m = radar?.sharesPerMinute10m ?? null;

  const input: PennyContinuationInput = {
    symbol,
    sessionDate: ctx.sessionDate,
    observedAt,
    price,
    previousRegularClose: previousRegularCloseValue,
    movePercentVsPriorClose: movePercent,
    impliesSplitScale,
    sessionVolumeShares: sessionVolume,
    dollarVolume,
    sharesPerMinute10m,
    spreadPct: candidate.spreadPct ?? null,
    distanceFromHodPct: radar?.distanceFromHodPct ?? null,
    sessionHigh: radar?.sessionHigh ?? snapshot?.dayHigh ?? null,
    priceVsSessionHighDropPct: radar?.priceVsSessionHighDropPct ?? null,
    vwap: radar?.vwap ?? null,
    aboveVwap: radar?.aboveVwap ?? null,
    holdingVwapAfterReclaim: radar?.holdingVwapAfterReclaim ?? null,
    velocityWindowTiers,
    velocityWindows,
    volumeAccelerationPct: radar?.volumeAccelerationPct ?? null,
    timeAdjustedRvol: radar?.timeAdjustedRvol ?? null,
    floatShares: candidate.floatShares ?? null,
    floatVerified: candidate.floatVerified,
    floatTurnover: null,
    catalystVerified: candidate.catalystVerified ?? null,
    catalystAgeHours: candidate.catalystAgeHours ?? null,
    catalystInvalidated: candidate.catalystInvalidated ?? null,
    radarHasReAcceleration: radar?.radarHasReAcceleration ?? null,
    radarHasSecondLeg: radar?.radarHasSecondLeg ?? null,
    instrumentType: candidate.instrumentType ?? null,
    observationSessionKind: observationKind ?? undefined,
    freshness: {
      evaluationClockMs: ctx.evaluationClockMs,
      symbolObservationMs,
      providerAsOfMs: radarObsMs ?? polygonObsMs,
      generationSyncMs: ctx.generationSyncMs,
      generationSyncIso: ctx.generationSyncIso,
      verifiedExpectedProviderDelayMs: ctx.verifiedExpectedProviderDelayMs,
      dataDeliveryPolicy: ctx.dataDeliveryPolicy,
    },
    observationGenerationId: ctx.observationGenerationId ?? null,
  };

  if (adapterReasons.length > 0) {
    return { input: null, adapterReasons };
  }

  return { input, adapterReasons: [] };
}
