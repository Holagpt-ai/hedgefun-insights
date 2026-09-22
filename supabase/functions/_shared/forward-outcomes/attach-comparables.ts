/**
 * Deno-safe attach of persisted forward outcomes to Repeat Mover comparables.
 */

const CONTINUATION_MIN_MOVE_PCT = 0.5;

type ForwardHorizon = "D1" | "D2" | "D3" | "D5";

type OutcomeRow = {
  episode_id: string;
  horizon: string;
  data_available: boolean;
  availability_state: string | null;
  return_pct: number | null;
  max_gain_pct: number | null;
  max_drawdown_pct: number | null;
  close_position: number | null;
  session_volume: number | null;
  rvol: number | null;
  horizon_session_move_pct: number | null;
};

export type ObservedForwardOutcomes = {
  closeToCloseReturnPct: Partial<Record<ForwardHorizon, number | null>>;
  highExcursionPct: Partial<Record<ForwardHorizon, number | null>>;
  lowExcursionPct: Partial<Record<ForwardHorizon, number | null>>;
  closePosition: Partial<Record<ForwardHorizon, number | null>>;
  nextSession: {
    nextSessionAvailable: boolean;
    nextSessionReturnPct: number | null;
    nextSessionHighExcursionPct: number | null;
    nextSessionLowExcursionPct: number | null;
    nextSessionClosePosition: number | null;
    nextSessionVolume: number | null;
    nextSessionRvol: number | null;
    nextSessionContinuation: boolean | null;
    episodeDirection: string | null;
  } | null;
};

function readNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRow(raw: Record<string, unknown>): OutcomeRow {
  return {
    episode_id: String(raw.episode_id),
    horizon: String(raw.horizon),
    data_available: Boolean(raw.data_available),
    availability_state: typeof raw.availability_state === "string" ? raw.availability_state : null,
    return_pct: readNum(raw.return_pct),
    max_gain_pct: readNum(raw.max_gain_pct),
    max_drawdown_pct: readNum(raw.max_drawdown_pct),
    close_position: readNum(raw.close_position),
    session_volume: readNum(raw.session_volume),
    rvol: readNum(raw.rvol),
    horizon_session_move_pct: readNum(raw.horizon_session_move_pct),
  };
}

function nextSessionFromD1(d1: OutcomeRow | undefined, direction: string | null): ObservedForwardOutcomes["nextSession"] {
  if (!d1 || !d1.data_available || d1.availability_state !== "AVAILABLE") {
    return {
      nextSessionAvailable: false,
      nextSessionReturnPct: null,
      nextSessionHighExcursionPct: null,
      nextSessionLowExcursionPct: null,
      nextSessionClosePosition: null,
      nextSessionVolume: null,
      nextSessionRvol: null,
      nextSessionContinuation: null,
      episodeDirection: direction,
    };
  }
  let continuation: boolean | null = null;
  const move = d1.horizon_session_move_pct ?? d1.return_pct;
  if (move !== null && direction === "POSITIVE") continuation = move >= CONTINUATION_MIN_MOVE_PCT;
  else if (move !== null && direction === "NEGATIVE") continuation = move <= -CONTINUATION_MIN_MOVE_PCT;
  return {
    nextSessionAvailable: true,
    nextSessionReturnPct: d1.horizon_session_move_pct ?? d1.return_pct,
    nextSessionHighExcursionPct: d1.max_gain_pct,
    nextSessionLowExcursionPct: d1.max_drawdown_pct,
    nextSessionClosePosition: d1.close_position,
    nextSessionVolume: d1.session_volume,
    nextSessionRvol: d1.rvol,
    nextSessionContinuation: continuation,
    episodeDirection: direction,
  };
}

function buildEvidence(
  byHorizon: Map<string, OutcomeRow>,
  direction: string,
): ObservedForwardOutcomes {
  const closeToCloseReturnPct: ObservedForwardOutcomes["closeToCloseReturnPct"] = {};
  const highExcursionPct: ObservedForwardOutcomes["highExcursionPct"] = {};
  const lowExcursionPct: ObservedForwardOutcomes["lowExcursionPct"] = {};
  const closePosition: ObservedForwardOutcomes["closePosition"] = {};
  for (const [horizon, row] of byHorizon.entries()) {
    if (!row.data_available) continue;
    const h = horizon as ForwardHorizon;
    closeToCloseReturnPct[h] = row.return_pct;
    highExcursionPct[h] = row.max_gain_pct;
    lowExcursionPct[h] = row.max_drawdown_pct;
    closePosition[h] = row.close_position;
  }
  return {
    closeToCloseReturnPct,
    highExcursionPct,
    lowExcursionPct,
    closePosition,
    nextSession: nextSessionFromD1(byHorizon.get("D1"), direction),
  };
}

export function attachForwardOutcomesToComparables<T extends {
  episodeId: string;
  direction: string;
  nextSessionMovePct: number | null;
  nextSessionContinuation: boolean | null;
}>(
  episodes: readonly T[],
  rawRows: readonly Record<string, unknown>[],
): Array<T & { observedForwardOutcomes?: ObservedForwardOutcomes }> {
  const byEpisode = new Map<string, Map<string, OutcomeRow>>();
  for (const raw of rawRows) {
    const row = mapRow(raw);
    const bucket = byEpisode.get(row.episode_id) ?? new Map<string, OutcomeRow>();
    bucket.set(row.horizon, row);
    byEpisode.set(row.episode_id, bucket);
  }
  return episodes.map((episode) => {
    const bucket = byEpisode.get(episode.episodeId);
    if (!bucket) return episode;
    const evidence = buildEvidence(bucket, episode.direction);
    const next = evidence.nextSession;
    return {
      ...episode,
      nextSessionMovePct: next?.nextSessionReturnPct ?? episode.nextSessionMovePct,
      nextSessionContinuation: next?.nextSessionContinuation ?? episode.nextSessionContinuation,
      observedForwardOutcomes: evidence,
    };
  });
}
