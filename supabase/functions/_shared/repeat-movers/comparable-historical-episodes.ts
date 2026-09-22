import type { RepeatMoverComparableEpisode } from "./types.ts";

const CONTINUATION_MIN_MOVE_PCT = 0.5;
const COMPARABLE_REQUIRE_SAME_DIRECTION = true;

function readNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sessionDateFromEpisode(
  episode: Record<string, unknown>,
  openTimestampToDate: Map<string, string>,
): string | null {
  const start = typeof episode.episode_start === "string" ? episode.episode_start : null;
  if (!start) return null;
  const mapped = openTimestampToDate.get(start);
  if (mapped) return mapped;
  return start.length >= 10 ? start.slice(0, 10) : null;
}

function closePosition(daily: Record<string, unknown>): number | null {
  const high = readNum(daily.high);
  const low = readNum(daily.low);
  const close = readNum(daily.close);
  if (high === null || low === null || close === null) return null;
  const range = high - low;
  if (range <= 0) return null;
  const position = (close - low) / range;
  return Number.isFinite(position) ? position : null;
}

function buildMaps(dailyRows: readonly Record<string, unknown>[]) {
  const dailyByDate = new Map<string, Record<string, unknown>>();
  const openTimestampToDate = new Map<string, string>();
  for (const daily of dailyRows) {
    const sessionDate = typeof daily.session_date === "string"
      ? daily.session_date.slice(0, 10)
      : null;
    if (!sessionDate) continue;
    dailyByDate.set(sessionDate, daily);
  }
  return { dailyByDate, openTimestampToDate };
}

function episodeMovePct(
  episode: Record<string, unknown>,
  dailyByDate: Map<string, Record<string, unknown>>,
  sessionDate: string | null,
): number | null {
  if (sessionDate) {
    const daily = dailyByDate.get(sessionDate);
    const move = daily ? readNum(daily.move_pct) : null;
    if (move !== null) return move;
  }
  const pos = readNum(episode.max_positive_move_pct);
  const neg = readNum(episode.max_negative_move_pct);
  const candidates = [pos !== null ? Math.abs(pos) : null, neg !== null ? Math.abs(neg) : null]
    .filter((value): value is number => value !== null);
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

function isComparable(
  candidateMove: number | null,
  referenceMove: number | null,
  candidateDirection: string,
  referenceDirection: string,
  tolerance: number,
): boolean {
  if (COMPARABLE_REQUIRE_SAME_DIRECTION && candidateDirection !== referenceDirection) return false;
  if (referenceMove === null || candidateMove === null) return false;
  return Math.abs(Math.abs(referenceMove) - Math.abs(candidateMove)) <= tolerance;
}

export function getComparableHistoricalEpisodes(input: {
  securityId: string;
  dailyHistory: readonly Record<string, unknown>[];
  episodes: readonly Record<string, unknown>[];
  currentContext?: {
    direction?: string;
    movePct?: number | null;
    tier?: string;
    sessionDate?: string | null;
  };
  comparableMovePctTolerance: number;
  limit?: number;
}): RepeatMoverComparableEpisode[] {
  const limit = input.limit ?? 20;
  const dailyRows = [...input.dailyHistory]
    .filter((row) => String(row.security_id) === input.securityId)
    .sort((a, b) => String(a.session_date).localeCompare(String(b.session_date)));
  const episodeRows = [...input.episodes]
    .filter((row) => String(row.security_id) === input.securityId)
    .sort((a, b) => String(a.episode_start).localeCompare(String(b.episode_start)));
  const { dailyByDate, openTimestampToDate } = buildMaps(dailyRows);

  const referenceDirection = input.currentContext?.direction ?? null;
  const referenceMove = input.currentContext?.movePct ?? null;
  const referenceTier = input.currentContext?.tier ?? null;
  const referenceDate = input.currentContext?.sessionDate ?? null;

  const sessionIndex = new Map(dailyRows.map((row, index) => [
    String(row.session_date).slice(0, 10),
    index,
  ]));
  const results: RepeatMoverComparableEpisode[] = [];

  for (const episode of episodeRows) {
    const sessionDate = sessionDateFromEpisode(episode, openTimestampToDate);
    if (referenceDate && sessionDate === referenceDate) continue;
    const direction = typeof episode.direction === "string" ? episode.direction : "MIXED";
    const tier = typeof episode.tier === "string" ? episode.tier : "NOTABLE";
    const move = episodeMovePct(episode, dailyByDate, sessionDate);
    if (referenceDirection !== null || referenceMove !== null) {
      if (!isComparable(
        move,
        referenceMove,
        direction,
        referenceDirection ?? direction,
        input.comparableMovePctTolerance,
      )) continue;
    }
    const daily = sessionDate ? dailyByDate.get(sessionDate) : undefined;
    let nextSessionMovePct: number | null = null;
    let nextSessionContinuation: boolean | null = null;
    if (sessionDate) {
      const index = sessionIndex.get(sessionDate);
      if (index !== undefined && index + 1 < dailyRows.length) {
        const nextDaily = dailyRows[index + 1];
        const nextMove = readNum(nextDaily?.move_pct);
        if (nextMove !== null) {
          nextSessionMovePct = nextMove;
          if (direction === "POSITIVE") {
            nextSessionContinuation = nextMove >= CONTINUATION_MIN_MOVE_PCT;
          } else if (direction === "NEGATIVE") {
            nextSessionContinuation = nextMove <= -CONTINUATION_MIN_MOVE_PCT;
          }
        }
      }
    }
    results.push({
      episodeId: String(episode.episode_id),
      sessionDate,
      tier,
      direction,
      movePct: move,
      rvol: readNum(episode.rvol),
      volume: readNum(episode.volume),
      dollarVolume: readNum(episode.dollar_volume) ?? (daily ? readNum(daily.dollar_volume) : null),
      closePosition: daily ? closePosition(daily) : null,
      nextSessionMovePct,
      nextSessionContinuation,
      similarity: {
        sameDirection: referenceDirection === null || direction === referenceDirection,
        movePctDelta: referenceMove !== null && move !== null
          ? Math.abs(Math.abs(referenceMove) - Math.abs(move))
          : null,
        sameTier: referenceTier === null || tier === referenceTier,
      },
    });
  }

  return results
    .sort((left, right) => {
      const leftDelta = left.similarity.movePctDelta;
      const rightDelta = right.similarity.movePctDelta;
      if (leftDelta !== null && rightDelta !== null && leftDelta !== rightDelta) {
        return leftDelta - rightDelta;
      }
      if (leftDelta === null && rightDelta !== null) return 1;
      if (leftDelta !== null && rightDelta === null) return -1;
      return (right.sessionDate ?? "").localeCompare(left.sessionDate ?? "");
    })
    .slice(0, limit);
}
