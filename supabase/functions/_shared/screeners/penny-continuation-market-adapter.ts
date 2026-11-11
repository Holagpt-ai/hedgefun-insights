/**
 * Verified Polygon screener snapshot → PennyContinuationInput (Batch 224).
 * Never substitutes generation sync time for symbol observation time.
 */

import { PENNY_MAX_OBSERVATION_AGE_MS } from "../config/penny-continuation.config.ts";
import { OVERNIGHT_SCANNER_PIPELINE_READY } from "../markets/equity-session-control.ts";
import type { RadarV22SessionKind } from "../radar-v22/persistence-v2.ts";
import {
  buildSnapshotFromPolygonTicker,
  gapPercentFromVerifiedInputs,
  overlayVerifiedPreviousCloseOnTicker,
  type VerifiedPreviousCloseOverlay,
} from "./normalized-market-snapshot.ts";
import {
  extractPennyFactsFromRadarV22Row,
  pennyRadarFactsWithStructureSuppressed,
  type PennyContinuationRadarFacts,
} from "./penny-continuation-radar-evidence.ts";
import type {
  PennyContinuationAdapterOutcome,
  PennyContinuationDiscoveredCandidate,
  PennyContinuationIntegrationContext,
  PennyIntegrationAdapterReason,
} from "./penny-continuation-integration-types.ts";
import type { PennyContinuationInput } from "./penny-continuation-types.ts";
import { isFiniteNumber } from "./screener-contract-lite.ts";
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
import {
  isOvernightObservationKind,
  qualificationObservationKind,
  type ObservationSessionKind,
} from "./session-sync-context.ts";
import { computeSignedMovePercentVsPriorClose } from "./penny-continuation-eligibility.ts";

const PRIOR_CLOSE_RELATIVE_TOLERANCE = 0.02;
/** Radar structure evidence must align with Polygon observation within Penny slack. */
const RADAR_POLYGON_STRUCTURE_SYNC_MS = PENNY_MAX_OBSERVATION_AGE_MS;

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

function radarSessionToObservationKind(
  kind: RadarV22SessionKind,
): Exclude<ObservationSessionKind, "overnight"> | null {
  switch (kind) {
    case "pre-market":
      return "pre-market";
    case "market":
      return "market";
    case "after-hours":
      return "after-hours";
    case "closed":
      return "closed";
    default:
      return null;
  }
}

function polygonExtendedMatchesRadarSession(
  extendedSession: boolean,
  radarKind: RadarV22SessionKind,
): boolean {
  if (radarKind === "market") return extendedSession === false;
  if (radarKind === "pre-market" || radarKind === "after-hours") {
    return extendedSession === true;
  }
  return true;
}

function observationKindsCompatible(
  derived: ObservationSessionKind | null,
  radarKind: RadarV22SessionKind,
): boolean {
  const radarMapped = radarSessionToObservationKind(radarKind);
  if (derived === null || radarMapped === null) return true;
  if (derived === "overnight" || radarMapped === "closed") return false;
  return derived === radarMapped;
}

function resolveRadarFactsForPolygonPair(
  radar: PennyContinuationRadarFacts,
  polygonObsMs: number,
): { facts: PennyContinuationRadarFacts; aligned: boolean; desync: boolean } {
  const radarMs = radar.providerAsOfMs;
  if (radarMs === null) {
    return {
      facts: pennyRadarFactsWithStructureSuppressed(radar),
      aligned: false,
      desync: false,
    };
  }
  const delta = polygonObsMs - radarMs;
  if (delta < 0 || delta > RADAR_POLYGON_STRUCTURE_SYNC_MS) {
    return {
      facts: pennyRadarFactsWithStructureSuppressed(radar),
      aligned: false,
      desync: delta > RADAR_POLYGON_STRUCTURE_SYNC_MS || delta < 0,
    };
  }
  return { facts: radar, aligned: true, desync: false };
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

  let ticker: PolygonTicker | null = candidate.polygonTicker ?? null;
  if (ticker) {
    const polySym = normalizeSymbol(ticker.ticker);
    if (polySym !== null && polySym !== symbol) {
      pushReason(adapterReasons, "SYMBOL_MISMATCH");
    }
  }
  if (candidate.radarRow) {
    const radarSym = normalizeSymbol(candidate.radarRow.symbol);
    if (radarSym !== null && radarSym !== symbol) {
      pushReason(adapterReasons, "SYMBOL_MISMATCH");
    }
  }

  let radarRaw = candidate.radarRow
    ? extractPennyFactsFromRadarV22Row(candidate.radarRow)
    : null;

  if (radarRaw && radarRaw.tradingDate !== ctx.sessionDate) {
    pushReason(adapterReasons, "SESSION_DATE_CONFLICT");
  }

  if (ticker && radarRaw?.previousRegularClose) {
    const overlay = buildVerifiedOverlay(
      radarRaw.previousRegularClose,
      symbol,
      candidate.radarRow?.prior_session_volume ?? null,
    );
    if (overlay) {
      ticker = overlayVerifiedPreviousCloseOnTicker(ticker, overlay);
    }
  }

  if (!ticker && !radarRaw) {
    pushReason(adapterReasons, "MISSING_MARKET_EVIDENCE");
    return { input: null, adapterReasons };
  }

  const polygonObsIso = ticker
    ? parseProviderAsOf(ticker.updated, syncNowMs)
    : null;
  const polygonObsMs = observationMsFromIso(polygonObsIso);
  const radarObsMs = radarRaw?.providerAsOfMs ?? null;

  const symbolObservationMs = polygonObsMs ?? radarObsMs;
  const observedAt = polygonObsIso ?? radarRaw?.providerAsOfIso ?? null;

  if (symbolObservationMs === null || observedAt === null) {
    pushReason(adapterReasons, "MISSING_OBSERVATION_TS");
    return { input: null, adapterReasons };
  }

  const derivedObservationKind = qualificationObservationKind(
    symbolObservationMs,
    syncNowMs,
    null,
    OVERNIGHT_SCANNER_PIPELINE_READY,
  );

  if (ctx.observationSessionKind !== undefined) {
    if (
      derivedObservationKind === null ||
      ctx.observationSessionKind !== derivedObservationKind
    ) {
      pushReason(adapterReasons, "OBSERVATION_SESSION_OVERRIDE_REJECTED");
    }
  }

  if (
    derivedObservationKind !== null &&
    isOvernightObservationKind(derivedObservationKind)
  ) {
    pushReason(adapterReasons, "OVERNIGHT_OBSERVATION_UNSUPPORTED");
  }

  let radarStructureAligned = true;
  let volumeVelocity5m: number | null = radarRaw?.volumeVelocity5mSharesPerMinute ?? null;

  if (ticker && radarRaw) {
    const polygonPrev = previousRegularClose(ticker);
    if (priorClosesConflict(polygonPrev, radarRaw.previousRegularClose)) {
      pushReason(adapterReasons, "PRIOR_CLOSE_CONFLICT");
    }

    const extendedForPolygon = extendedQuoteSemanticsForTicker(ticker, tabOpts);
    if (extendedForPolygon === null) {
      pushReason(adapterReasons, "MISSING_MARKET_EVIDENCE");
    } else if (
      !polygonExtendedMatchesRadarSession(extendedForPolygon, radarRaw.sessionKind)
    ) {
      pushReason(adapterReasons, "SESSION_KIND_MISMATCH");
    }
    if (!observationKindsCompatible(derivedObservationKind, radarRaw.sessionKind)) {
      pushReason(adapterReasons, "SESSION_KIND_MISMATCH");
    }

    if (polygonObsMs !== null) {
      const resolved = resolveRadarFactsForPolygonPair(radarRaw, polygonObsMs);
      radarRaw = resolved.facts;
      radarStructureAligned = resolved.aligned;
      volumeVelocity5m = resolved.facts.volumeVelocity5mSharesPerMinute;
      if (resolved.desync) {
        pushReason(adapterReasons, "RADAR_POLYGON_OBSERVATION_DESYNC");
      }
    }
  } else if (ticker) {
    const polygonPrev = previousRegularClose(ticker);
    if (polygonPrev === null) {
      /* eligibility may fail later */
    }
  } else if (radarRaw) {
    if (!observationKindsCompatible(derivedObservationKind, radarRaw.sessionKind)) {
      pushReason(adapterReasons, "SESSION_KIND_MISMATCH");
    }
  }

  if (adapterReasons.length > 0) {
    return {
      input: null,
      adapterReasons,
      diagnostics: {
        volumeVelocity5mSharesPerMinute: volumeVelocity5m,
        radarStructureEvidenceAligned: radarStructureAligned,
      },
    };
  }

  const extended =
    ticker !== null
      ? extendedQuoteSemanticsForTicker(ticker, tabOpts)
      : ctx.extendedSession ?? false;
  if (extended === null) {
    return {
      input: null,
      adapterReasons: ["MISSING_MARKET_EVIDENCE"],
      diagnostics: {
        volumeVelocity5mSharesPerMinute: volumeVelocity5m,
        radarStructureEvidenceAligned: radarStructureAligned,
      },
    };
  }

  const snapshot = ticker
    ? buildSnapshotFromPolygonTicker(ticker, {
      symbol,
      extendedSession: extended,
      nowMs: syncNowMs,
      providerTimestamp: polygonObsIso,
    })
    : null;

  const price = snapshot?.price ?? radarRaw?.price ?? null;
  const previousRegularCloseValue = snapshot?.previousClose ??
    radarRaw?.previousRegularClose ??
    null;

  const observationKind = derivedObservationKind;

  const sessionVolume = snapshot?.volume ?? radarRaw?.sessionVolumeShares ?? null;
  const dollarVolume = snapshot?.dollarVolume ??
    (price !== null && sessionVolume !== null ? price * sessionVolume : null) ??
    radarRaw?.dollarVolume ??
    null;

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

  const sharesPerMinute10m = isFiniteNumber(candidate.verifiedSharesPerMinute10m) &&
      candidate.verifiedSharesPerMinute10m >= 0
    ? candidate.verifiedSharesPerMinute10m
    : null;

  const radar = radarRaw;

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
      providerAsOfMs: polygonObsMs ?? radarObsMs,
      generationSyncMs: ctx.generationSyncMs,
      generationSyncIso: ctx.generationSyncIso,
      verifiedExpectedProviderDelayMs: ctx.verifiedExpectedProviderDelayMs,
      dataDeliveryPolicy: ctx.dataDeliveryPolicy,
    },
    observationGenerationId: ctx.observationGenerationId ?? null,
  };

  return {
    input,
    adapterReasons: [],
    diagnostics: {
      volumeVelocity5mSharesPerMinute: volumeVelocity5m,
      radarStructureEvidenceAligned: radarStructureAligned,
    },
  };
}
