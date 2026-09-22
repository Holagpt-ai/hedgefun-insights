import {
  FORWARD_OUTCOME_SESSION_HORIZONS,
  type ForwardOutcomeSessionHorizon,
} from "@/config/forward-outcomes.config";
import {
  closePositionFromOhlc,
  compareBroke,
  compareExceeded,
  compareOptionalBoolean,
  pctChange,
} from "@/lib/forward-outcomes/forward-outcome-formulas";
import type {
  ComputedForwardOutcomeFacts,
  EpisodeReferencePrices,
} from "@/lib/forward-outcomes/forward-outcome-types";
import { resolveHorizonSessionFromHistory } from "@/lib/forward-outcomes/trading-session-horizons";
import type {
  MarketBehaviorEpisode,
  SecurityDailyHistory,
} from "@/types/security-intelligence";

function readDaily(daily: SecurityDailyHistory | undefined): SecurityDailyHistory | null {
  return daily ?? null;
}

export function resolveEpisodeReferencePrices(input: {
  episode: MarketBehaviorEpisode;
  episodeDaily: SecurityDailyHistory | null;
}): EpisodeReferencePrices {
  const daily = input.episodeDaily;
  return {
    referenceClose: input.episode.endPrice ?? daily?.close ?? null,
    referenceHigh: input.episode.highPrice ?? daily?.high ?? null,
    referenceLow: input.episode.lowPrice ?? daily?.low ?? null,
  };
}

export function computeForwardOutcomeForHorizon(input: {
  horizon: ForwardOutcomeSessionHorizon;
  tradingSessionsAfter: number;
  episodeSessionDate: string | null;
  episode: MarketBehaviorEpisode;
  episodeDaily: SecurityDailyHistory | null;
  sortedSessionDates: readonly string[];
  dailyByDate: ReadonlyMap<string, SecurityDailyHistory>;
  reference: EpisodeReferencePrices;
}): ComputedForwardOutcomeFacts {
  const base: ComputedForwardOutcomeFacts = {
    horizon: input.horizon,
    availabilityState: "INVALID_EPISODE",
    dataAvailable: false,
    episodeSessionDate: input.episodeSessionDate,
    horizonSessionDate: null,
    referencePrice: input.reference.referenceClose,
    referenceTimestamp: input.episode.episodeStart,
    outcomePrice: null,
    returnPct: null,
    openToCloseReturnPct: null,
    gapPct: null,
    maxGainPct: null,
    maxDrawdownPct: null,
    highPrice: null,
    lowPrice: null,
    sessionVolume: null,
    rvol: null,
    horizonSessionMovePct: null,
    closePosition: null,
    closedAboveEpisodeClose: null,
    closedBelowEpisodeClose: null,
    exceededEpisodeHigh: null,
    brokeEpisodeLow: null,
  };

  if (!input.episodeSessionDate) return base;

  const resolved = resolveHorizonSessionFromHistory({
    episodeSessionDate: input.episodeSessionDate,
    tradingSessionsAfter: input.tradingSessionsAfter,
    sortedSessionDates: input.sortedSessionDates,
    dailyByDate: input.dailyByDate,
  });

  base.availabilityState = resolved.availabilityState;
  base.horizonSessionDate = resolved.horizonSessionDate;

  if (resolved.availabilityState !== "AVAILABLE") return base;

  const horizonDaily = readDaily(resolved.horizonDaily as SecurityDailyHistory | undefined);
  if (!horizonDaily) {
    base.availabilityState = "INSUFFICIENT_HISTORY";
    return base;
  }

  const refClose = input.reference.referenceClose;
  const refHigh = input.reference.referenceHigh;
  const refLow = input.reference.referenceLow;

  base.dataAvailable = true;
  base.outcomePrice = horizonDaily.close;
  base.highPrice = horizonDaily.high;
  base.lowPrice = horizonDaily.low;
  base.sessionVolume = horizonDaily.volume;
  base.rvol = null;
  base.horizonSessionMovePct = horizonDaily.movePct;
  base.returnPct = pctChange(refClose, horizonDaily.close);
  base.openToCloseReturnPct = pctChange(horizonDaily.open, horizonDaily.close);
  base.gapPct = pctChange(horizonDaily.previousClose, horizonDaily.open);
  base.maxGainPct = pctChange(refClose, horizonDaily.high);
  base.maxDrawdownPct = pctChange(refClose, horizonDaily.low);
  base.closePosition = closePositionFromOhlc({
    high: horizonDaily.high,
    low: horizonDaily.low,
    close: horizonDaily.close,
  });
  base.closedAboveEpisodeClose = compareOptionalBoolean(horizonDaily.close, refClose, "above");
  base.closedBelowEpisodeClose = compareOptionalBoolean(horizonDaily.close, refClose, "below");
  base.exceededEpisodeHigh = compareExceeded(horizonDaily.high, refHigh);
  base.brokeEpisodeLow = compareBroke(horizonDaily.low, refLow);

  return base;
}

export function computeForwardOutcomesForEpisode(input: {
  episode: MarketBehaviorEpisode;
  episodeSessionDate: string | null;
  episodeDaily: SecurityDailyHistory | null;
  sortedSessionDates: readonly string[];
  dailyByDate: ReadonlyMap<string, SecurityDailyHistory>;
}): ComputedForwardOutcomeFacts[] {
  const reference = resolveEpisodeReferencePrices({
    episode: input.episode,
    episodeDaily: input.episodeDaily,
  });

  return FORWARD_OUTCOME_SESSION_HORIZONS.map(({ horizon, tradingSessionsAfter }) =>
    computeForwardOutcomeForHorizon({
      horizon,
      tradingSessionsAfter,
      episodeSessionDate: input.episodeSessionDate,
      episode: input.episode,
      episodeDaily: input.episodeDaily,
      sortedSessionDates: input.sortedSessionDates,
      dailyByDate: input.dailyByDate,
      reference,
    }),
  );
}

export function horizonConfig(horizon: ForwardOutcomeSessionHorizon) {
  return FORWARD_OUTCOME_SESSION_HORIZONS.find((entry) => entry.horizon === horizon)!;
}
