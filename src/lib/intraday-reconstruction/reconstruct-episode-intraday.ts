import {
  INTRADAY_COMPLETE_COVERAGE_RATIO,
  INTRADAY_FIRST_MAJOR_MOVE_MIN_PCT,
  INTRADAY_MAJOR_PULLBACK_MIN_PCT,
  INTRADAY_RECONSTRUCTION_SOURCE,
  INTRADAY_VOLUME_BURST_MULTIPLIER,
  REGULAR_SESSION_MINUTE_BARS_EXPECTED,
  type IntradayHodSessionPhase,
} from "@/config/intraday-reconstruction.config";
import { episodeIntradayEventId } from "@/lib/intraday-reconstruction/deterministic-ids";
import type {
  EpisodeIntradayReconstructionFacts,
  EpisodeIntradayReconstructionInput,
  EpisodeIntradayReconstructionResult,
  EpisodeIntradayTimelineEvent,
  NormalizedIntradayBar,
} from "@/lib/intraday-reconstruction/intraday-reconstruction-types";
import { computeRegularSessionVwapSeries } from "@/lib/intraday-reconstruction/vwap";

function pctChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || from === 0 || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

function tsIso(ms: number): string {
  return new Date(ms).toISOString();
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function segmentHighLow(bars: readonly NormalizedIntradayBar[], segment: NormalizedIntradayBar["segment"]) {
  const seg = bars.filter((b) => b.segment === segment);
  if (seg.length === 0) return { high: null as number | null, low: null as number | null };
  let high = -Infinity;
  let low = Infinity;
  for (const b of seg) {
    if (b.high > high) high = b.high;
    if (b.low < low) low = b.low;
  }
  return { high: Number.isFinite(high) ? high : null, low: Number.isFinite(low) ? low : null };
}

function hodSessionPhase(hodTsMs: number, regOpenMs: number, regCloseMs: number): IntradayHodSessionPhase | null {
  if (regCloseMs <= regOpenMs) return null;
  const span = regCloseMs - regOpenMs;
  const pos = (hodTsMs - regOpenMs) / span;
  if (pos < 1 / 3) return "EARLY";
  if (pos < 2 / 3) return "MID";
  return "LATE";
}

function pushTimelineEvent(
  out: EpisodeIntradayTimelineEvent[],
  input: EpisodeIntradayReconstructionInput,
  eventType: EpisodeIntradayTimelineEvent["eventType"],
  eventAtMs: number,
  price: number | null,
  volume: number | null,
  metadata: Record<string, unknown>,
  sequence: number,
): void {
  const eventAt = tsIso(eventAtMs);
  out.push({
    episodeEventId: episodeIntradayEventId(input.episodeId, eventType, eventAt, sequence),
    episodeId: input.episodeId,
    securityId: input.securityId,
    eventType,
    eventAt,
    price,
    volume,
    metadata,
  });
}

export function reconstructEpisodeIntraday(
  input: EpisodeIntradayReconstructionInput,
): EpisodeIntradayReconstructionResult {
  const regBars = input.bars.filter((b) => b.segment === "REGULAR");
  const regBarsAvailable = regBars.length;
  const regBarsExpected = REGULAR_SESSION_MINUTE_BARS_EXPECTED;
  const sessionCoveragePct = regBarsExpected > 0
    ? regBarsAvailable / regBarsExpected
    : null;

  const timeline: EpisodeIntradayTimelineEvent[] = [];
  let seq = 0;

  const baseUnavailable = (): EpisodeIntradayReconstructionFacts => ({
    episodeId: input.episodeId,
    securityId: input.securityId,
    sessionDate: input.sessionDate,
    completenessState: regBarsAvailable === 0 && input.dailyOpen != null ? "DAILY_ONLY" : "UNAVAILABLE",
    barGranularity: input.barGranularity,
    barsExpected: input.bars.length > 0 ? input.bars.length : null,
    barsAvailable: input.bars.length,
    regBarsExpected,
    regBarsAvailable,
    sessionCoveragePct,
    provider: "polygon",
    source: input.source,
    sourceAsOf: input.sourceAsOf,
    fetchedAt: input.fetchedAt,
    computedAt: input.computedAt,
    sessionOpenAt: null,
    hodAt: null,
    lodAt: null,
    firstMajorMoveAt: null,
    largestVolumeBurstAt: null,
    closeAt: null,
    openPrice: input.dailyOpen,
    hodPrice: input.dailyHigh,
    lodPrice: input.dailyLow,
    closePrice: input.dailyClose,
    moveOpenToHodPct: input.dailyOpen != null && input.dailyHigh != null
      ? pctChange(input.dailyOpen, input.dailyHigh)
      : null,
    maxDrawdownFromHodPct: null,
    largestPullbackPct: null,
    recoveredFromPullback: null,
    closeVsHodPct: input.dailyHigh != null && input.dailyClose != null
      ? pctChange(input.dailyHigh, input.dailyClose)
      : null,
    closePosition: input.dailyHigh != null && input.dailyLow != null && input.dailyClose != null
      && input.dailyHigh > input.dailyLow
      ? (input.dailyClose - input.dailyLow) / (input.dailyHigh - input.dailyLow)
      : null,
    totalIntradayVolume: input.dailyVolume,
    largestBarVolume: null,
    volumeBeforeHod: null,
    volumeAfterHod: null,
    volumeConcentrationTop5Pct: null,
    premarketHigh: segmentHighLow(input.bars, "PREMARKET").high,
    premarketLow: segmentHighLow(input.bars, "PREMARKET").low,
    regularHigh: input.dailyHigh,
    regularLow: input.dailyLow,
    afterHoursHigh: segmentHighLow(input.bars, "AFTER_HOURS").high,
    afterHoursLow: segmentHighLow(input.bars, "AFTER_HOURS").low,
    momentumLegCount: null,
    majorPullbackCount: null,
    hodSessionPhase: null,
    vwapAtClose: null,
    firstVwapBreakAt: null,
    vwapReclaimCount: null,
    secondsAboveVwap: null,
    secondsBelowVwap: null,
    hodVsVwapPct: null,
    haltCount: null,
    firstHaltAt: null,
    haltDataAvailable: false,
    timeline,
  });

  if (regBarsAvailable === 0) {
    return { facts: baseUnavailable() };
  }

  const openBar = regBars[0]!;
  const closeBar = regBars[regBars.length - 1]!;
  const openPrice = openBar.open;
  const closePrice = closeBar.close;
  const sessionOpenAt = openBar.tsMs;
  const closeAt = closeBar.tsMs;

  let hodPrice = -Infinity;
  let hodAtMs = openBar.tsMs;
  let lodPrice = Infinity;
  let lodAtMs = openBar.tsMs;
  for (const bar of regBars) {
    if (bar.high > hodPrice) {
      hodPrice = bar.high;
      hodAtMs = bar.tsMs;
    }
    if (bar.low < lodPrice) {
      lodPrice = bar.low;
      lodAtMs = bar.tsMs;
    }
  }

  const regOpenMs = sessionOpenAt;
  const regCloseMs = closeAt;

  pushTimelineEvent(timeline, input, "SESSION_OPEN", sessionOpenAt, openPrice, openBar.volume, {}, seq++);

  let firstMajorMoveAt: string | null = null;
  for (const bar of regBars) {
    const move = pctChange(bar.open, bar.close);
    if (move != null && Math.abs(move) >= INTRADAY_FIRST_MAJOR_MOVE_MIN_PCT * 100) {
      firstMajorMoveAt = tsIso(bar.tsMs);
      pushTimelineEvent(timeline, input, "MOMENTUM_TRIGGER", bar.tsMs, bar.close, bar.volume, {
        movePct: move,
      }, seq++);
      break;
    }
  }

  const volMedian = median(regBars.map((b) => b.volume)) ?? 0;
  let largestBarVolume = 0;
  let largestVolumeBurstAt: string | null = null;
  for (const bar of regBars) {
    if (bar.volume > largestBarVolume) {
      largestBarVolume = bar.volume;
      largestVolumeBurstAt = tsIso(bar.tsMs);
    }
    if (volMedian > 0 && bar.volume >= volMedian * INTRADAY_VOLUME_BURST_MULTIPLIER) {
      pushTimelineEvent(timeline, input, "VOLUME_TRIGGER", bar.tsMs, bar.close, bar.volume, {
        medianVolume: volMedian,
        multiplier: INTRADAY_VOLUME_BURST_MULTIPLIER,
      }, seq++);
    }
  }

  pushTimelineEvent(timeline, input, "NEW_HOD", hodAtMs, hodPrice, null, {}, seq++);
  pushTimelineEvent(timeline, input, "NEW_LOD", lodAtMs, lodPrice, null, {}, seq++);

  let runningHigh = openPrice;
  let maxDrawdownFromHod = 0;
  let largestPullbackPct = 0;
  let majorPullbackCount = 0;
  let momentumLegCount = 0;
  let inPullback = false;
  let pullbackLow = openPrice;
  let recoveredFromPullback: boolean | null = null;

  for (const bar of regBars) {
    if (bar.high > runningHigh) {
      if (inPullback) {
        momentumLegCount += 1;
        inPullback = false;
        const recovery = pctChange(pullbackLow, bar.high);
        if (recovery != null && recovery > 0) recoveredFromPullback = true;
      }
      runningHigh = bar.high;
    }
    const dd = pctChange(runningHigh, bar.low);
    if (dd != null && dd < 0) {
      const abs = Math.abs(dd);
      if (abs > maxDrawdownFromHod) maxDrawdownFromHod = abs;
      const sessionRange = hodPrice - lodPrice;
      const pullbackThreshold = sessionRange > 0
        ? (sessionRange / openPrice) * 100 * INTRADAY_MAJOR_PULLBACK_MIN_PCT
        : INTRADAY_MAJOR_PULLBACK_MIN_PCT * 100;
      if (abs >= Math.max(pullbackThreshold, INTRADAY_MAJOR_PULLBACK_MIN_PCT * 100)) {
        if (!inPullback) {
          majorPullbackCount += 1;
          inPullback = true;
          pushTimelineEvent(timeline, input, "PULLBACK", bar.tsMs, bar.low, bar.volume, {
            drawdownPct: dd,
          }, seq++);
        }
        if (abs > largestPullbackPct) largestPullbackPct = abs;
        pullbackLow = Math.min(pullbackLow, bar.low);
      }
    }
  }

  let volumeBeforeHod = 0;
  let volumeAfterHod = 0;
  for (const bar of regBars) {
    if (bar.tsMs <= hodAtMs) volumeBeforeHod += bar.volume;
    else volumeAfterHod += bar.volume;
  }

  const sortedVolumes = [...regBars].map((b) => b.volume).sort((a, b) => b - a);
  const top5 = sortedVolumes.slice(0, 5).reduce((s, v) => s + v, 0);
  const totalVol = regBars.reduce((s, b) => s + b.volume, 0);
  const volumeConcentrationTop5Pct = totalVol > 0 ? (top5 / totalVol) * 100 : null;

  const vwapSeries = computeRegularSessionVwapSeries(input.bars);
  const vwapAtClose = vwapSeries.length > 0 ? vwapSeries[vwapSeries.length - 1]!.vwap : null;
  let firstVwapBreakAt: string | null = null;
  let vwapReclaimCount = 0;
  let secondsAboveVwap = 0;
  let secondsBelowVwap = 0;
  let prevSide: "above" | "below" | null = null;
  const barDurationSec = input.barGranularity === "5m" ? 300 : 60;

  for (let i = 0; i < regBars.length; i++) {
    const bar = regBars[i]!;
    const vwap = vwapSeries[i]?.vwap;
    if (vwap == null) continue;
    const side = bar.close >= vwap ? "above" : "below";
    if (side === "above") secondsAboveVwap += barDurationSec;
    else secondsBelowVwap += barDurationSec;
    if (prevSide != null && side !== prevSide) {
      if (side === "below" && firstVwapBreakAt == null) {
        firstVwapBreakAt = tsIso(bar.tsMs);
        pushTimelineEvent(timeline, input, "VWAP_LOSS", bar.tsMs, bar.close, bar.volume, { vwap }, seq++);
      }
      if (side === "above" && prevSide === "below") {
        vwapReclaimCount += 1;
        pushTimelineEvent(timeline, input, "VWAP_RECLAIM", bar.tsMs, bar.close, bar.volume, { vwap }, seq++);
      }
    }
    prevSide = side;
  }

  const hodVsVwapPct = vwapAtClose != null ? pctChange(vwapAtClose, hodPrice) : null;

  pushTimelineEvent(timeline, input, "CLOSE", closeAt, closePrice, closeBar.volume, {}, seq++);

  const ah = segmentHighLow(input.bars, "AFTER_HOURS");
  if (ah.high != null) {
    const ahBar = input.bars.filter((b) => b.segment === "AFTER_HOURS").sort((a, b) => b.high - a.high)[0];
    if (ahBar) {
      pushTimelineEvent(timeline, input, "AFTER_HOURS_EXTENSION", ahBar.tsMs, ah.high, ahBar.volume, {}, seq++);
    }
  }

  const completenessState = sessionCoveragePct != null
    && sessionCoveragePct >= INTRADAY_COMPLETE_COVERAGE_RATIO
    ? "COMPLETE"
    : "PARTIAL";

  const closePosition = hodPrice > lodPrice
    ? (closePrice - lodPrice) / (hodPrice - lodPrice)
    : null;

  const facts: EpisodeIntradayReconstructionFacts = {
    episodeId: input.episodeId,
    securityId: input.securityId,
    sessionDate: input.sessionDate,
    completenessState,
    barGranularity: input.barGranularity,
    barsExpected: input.bars.length,
    barsAvailable: input.bars.length,
    regBarsExpected,
    regBarsAvailable,
    sessionCoveragePct,
    provider: "polygon",
    source: input.source || INTRADAY_RECONSTRUCTION_SOURCE,
    sourceAsOf: input.sourceAsOf,
    fetchedAt: input.fetchedAt,
    computedAt: input.computedAt,
    sessionOpenAt: tsIso(sessionOpenAt),
    hodAt: tsIso(hodAtMs),
    lodAt: tsIso(lodAtMs),
    firstMajorMoveAt,
    largestVolumeBurstAt,
    closeAt: tsIso(closeAt),
    openPrice,
    hodPrice,
    lodPrice,
    closePrice,
    moveOpenToHodPct: pctChange(openPrice, hodPrice),
    maxDrawdownFromHodPct: maxDrawdownFromHod > 0 ? maxDrawdownFromHod : null,
    largestPullbackPct: largestPullbackPct > 0 ? largestPullbackPct : null,
    recoveredFromPullback,
    closeVsHodPct: pctChange(hodPrice, closePrice),
    closePosition,
    totalIntradayVolume: totalVol,
    largestBarVolume,
    volumeBeforeHod,
    volumeAfterHod,
    volumeConcentrationTop5Pct,
    premarketHigh: segmentHighLow(input.bars, "PREMARKET").high,
    premarketLow: segmentHighLow(input.bars, "PREMARKET").low,
    regularHigh: hodPrice,
    regularLow: lodPrice,
    afterHoursHigh: ah.high,
    afterHoursLow: ah.low,
    momentumLegCount,
    majorPullbackCount,
    hodSessionPhase: hodSessionPhase(hodAtMs, regOpenMs, regCloseMs),
    vwapAtClose,
    firstVwapBreakAt,
    vwapReclaimCount: vwapSeries.length > 0 ? vwapReclaimCount : null,
    secondsAboveVwap: vwapSeries.length > 0 ? secondsAboveVwap : null,
    secondsBelowVwap: vwapSeries.length > 0 ? secondsBelowVwap : null,
    hodVsVwapPct,
    haltCount: null,
    firstHaltAt: null,
    haltDataAvailable: false,
    timeline,
  };

  return { facts };
}
