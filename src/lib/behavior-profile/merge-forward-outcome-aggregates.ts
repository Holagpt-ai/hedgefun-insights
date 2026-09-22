import type { ForwardOutcomeSecurityAggregate } from "@/lib/behavior-profile/forward-outcome-aggregate-types";
import type { BehaviorProfileForwardOutcomes } from "@/types/behavior-profile";

function pct(part: number, total: number): number | null {
  if (total <= 0) return null;
  return (part / total) * 100;
}

function coveragePct(outcomeCount: number, episodeCount: number): number | null {
  if (episodeCount <= 0) return null;
  return (outcomeCount / episodeCount) * 100;
}

export function emptyBehaviorProfileForwardOutcomes(): BehaviorProfileForwardOutcomes {
  return {
    episodesWithD1Outcome: 0,
    episodesWithD5Outcome: 0,
    forwardOutcomeCoveragePctD1: null,
    forwardOutcomeCoveragePctD5: null,
    medianD1ReturnPct: null,
    positiveD1Count: 0,
    negativeD1Count: 0,
    zeroD1Count: 0,
    positiveD1Pct: null,
    negativeD1Pct: null,
    medianD5ReturnPct: null,
    positiveD5Count: 0,
    negativeD5Count: 0,
    zeroD5Count: 0,
    positiveD5Pct: null,
    negativeD5Pct: null,
    medianD1MaxGainPct: null,
    medianD1MaxDrawdownPct: null,
    medianD5MaxGainPct: null,
    medianD5MaxDrawdownPct: null,
    observedNextSessionSampleSize: 0,
    observedNextSessionPositivePct: null,
    observedNextSessionNegativePct: null,
  };
}

export function behaviorProfileForwardOutcomesFromAggregate(input: {
  episodeCount: number;
  aggregate: ForwardOutcomeSecurityAggregate | null;
}): BehaviorProfileForwardOutcomes {
  const base = emptyBehaviorProfileForwardOutcomes();
  const aggregate = input.aggregate;
  if (!aggregate) return base;

  const d1Count = aggregate.episode_count_d1 ?? 0;
  const d5Count = aggregate.episode_count_d5 ?? 0;
  const positiveD1 = aggregate.positive_return_d1_count ?? 0;
  const negativeD1 = aggregate.negative_return_d1_count ?? 0;
  const zeroD1 = aggregate.zero_return_d1_count ?? 0;
  const positiveD5 = aggregate.positive_return_d5_count ?? 0;
  const negativeD5 = aggregate.negative_return_d5_count ?? 0;
  const zeroD5 = aggregate.zero_return_d5_count ?? 0;
  const d1SignedTotal = positiveD1 + negativeD1 + zeroD1;
  const d5SignedTotal = positiveD5 + negativeD5 + zeroD5;

  const posSample = aggregate.observed_next_session_positive_sample_size ?? 0;
  const negSample = aggregate.observed_next_session_negative_sample_size ?? 0;
  const posCont = aggregate.observed_next_session_positive_continuation_count ?? 0;
  const negCont = aggregate.observed_next_session_negative_continuation_count ?? 0;

  return {
    episodesWithD1Outcome: d1Count,
    episodesWithD5Outcome: d5Count,
    forwardOutcomeCoveragePctD1: coveragePct(d1Count, input.episodeCount),
    forwardOutcomeCoveragePctD5: coveragePct(d5Count, input.episodeCount),
    medianD1ReturnPct: aggregate.median_return_d1,
    positiveD1Count: positiveD1,
    negativeD1Count: negativeD1,
    zeroD1Count: zeroD1,
    positiveD1Pct: pct(positiveD1, d1SignedTotal),
    negativeD1Pct: pct(negativeD1, d1SignedTotal),
    medianD5ReturnPct: aggregate.median_return_d5,
    positiveD5Count: positiveD5,
    negativeD5Count: negativeD5,
    zeroD5Count: zeroD5,
    positiveD5Pct: pct(positiveD5, d5SignedTotal),
    negativeD5Pct: pct(negativeD5, d5SignedTotal),
    medianD1MaxGainPct: aggregate.median_max_gain_d1,
    medianD1MaxDrawdownPct: aggregate.median_max_drawdown_d1,
    medianD5MaxGainPct: aggregate.median_max_gain_d5,
    medianD5MaxDrawdownPct: aggregate.median_max_drawdown_d5,
    observedNextSessionSampleSize: posSample + negSample,
    observedNextSessionPositivePct: pct(posCont, posSample),
    observedNextSessionNegativePct: pct(negCont, negSample),
  };
}
