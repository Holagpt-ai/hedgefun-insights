import {
  buildDayTradeQualificationEvaluation,
  type DayTradeMetricsRow,
} from "./evaluate-five-pillars.ts";
import {
  emptyQualificationEpisodeState,
  stepDayTradeQualificationLifecycle,
  type DayTradeQualificationEpisodeState,
  type DayTradeQualificationEvaluation,
} from "./qualification-lifecycle.ts";

export const QUALIFICATION_STATE_UPSERT_RPC = "day_trade_qualification_state_upsert_v1";
export const QUALIFICATION_EVENT_INSERT_RPC = "day_trade_qualification_event_insert_v1";
export const QUALIFICATION_LIST_RPC = "day_trade_qualification_list_v1";

export type QualificationDb = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export function stateRowToEpisode(row: Record<string, unknown>): DayTradeQualificationEpisodeState {
  return {
    sessionDate: String(row.session_date),
    symbol: String(row.symbol),
    phase: (row.phase as DayTradeQualificationEpisodeState["phase"]) ?? null,
    firstQualifiedAt: row.first_qualified_at ? String(row.first_qualified_at) : null,
    lastQualifiedAt: row.last_qualified_at ? String(row.last_qualified_at) : null,
    graceFirstFailureAt: row.grace_first_failure_at
      ? String(row.grace_first_failure_at)
      : null,
    graceFailureCount: Number(row.grace_failure_count ?? 0),
    expiredAt: row.expired_at ? String(row.expired_at) : null,
    expirationReasonCodes: Array.isArray(row.expiration_reason_codes)
      ? (row.expiration_reason_codes as string[])
      : [],
    pillarOutcomes: (row.pillar_outcomes as DayTradeQualificationEpisodeState["pillarOutcomes"]) ??
      null,
    monitoredPrice: row.monitored_price !== null && row.monitored_price !== undefined
      ? Number(row.monitored_price)
      : null,
    monitoredVolume: row.monitored_volume !== null && row.monitored_volume !== undefined
      ? Number(row.monitored_volume)
      : null,
    providerAsOfIso: row.provider_as_of ? String(row.provider_as_of) : null,
    priorEpisodes: Array.isArray(row.prior_episodes)
      ? (row.prior_episodes as DayTradeQualificationEpisodeState["priorEpisodes"])
      : [],
    lastSnapshotKey: row.last_snapshot_key ? String(row.last_snapshot_key) : null,
    lastMarketDataMs: row.last_market_data_ms !== null && row.last_market_data_ms !== undefined
      ? Number(row.last_market_data_ms)
      : null,
  };
}

export function episodeStateToRow(state: DayTradeQualificationEpisodeState): Record<string, unknown> {
  return {
    session_date: state.sessionDate,
    symbol: state.symbol,
    phase: state.phase,
    first_qualified_at: state.firstQualifiedAt,
    last_qualified_at: state.lastQualifiedAt,
    grace_first_failure_at: state.graceFirstFailureAt,
    grace_failure_count: state.graceFailureCount,
    expired_at: state.expiredAt,
    expiration_reason_codes: state.expirationReasonCodes,
    pillar_outcomes: state.pillarOutcomes,
    monitored_price: state.monitoredPrice,
    monitored_volume: state.monitoredVolume,
    provider_as_of: state.providerAsOfIso,
    prior_episodes: state.priorEpisodes,
    last_snapshot_key: state.lastSnapshotKey,
    last_market_data_ms: state.lastMarketDataMs,
  };
}

export async function loadQualificationStatesForSession(
  db: QualificationDb,
  sessionDate: string,
): Promise<Map<string, DayTradeQualificationEpisodeState>> {
  const res = await db.rpc(QUALIFICATION_LIST_RPC, { p_session_date: sessionDate });
  if (res.error || !Array.isArray(res.data)) return new Map();
  const map = new Map<string, DayTradeQualificationEpisodeState>();
  for (const row of res.data as Record<string, unknown>[]) {
    const episode = stateRowToEpisode(row);
    map.set(episode.symbol, episode);
  }
  return map;
}

export function buildEvaluationFromMetrics(input: {
  row: DayTradeMetricsRow;
  syncRunId: string;
  evaluable: boolean;
  unevaluableReason?: DayTradeQualificationEvaluation["unevaluableReason"];
}): DayTradeQualificationEvaluation {
  const providerMs = input.row.provider_as_of
    ? Date.parse(input.row.provider_as_of)
    : Date.now();
  const marketDataMs = Number.isFinite(providerMs) ? providerMs : Date.now();
  const snapshotKey = `${input.syncRunId}:${input.row.symbol}:${input.row.provider_as_of ?? "none"}`;
  return buildDayTradeQualificationEvaluation({
    row: input.row,
    marketDataMs,
    snapshotKey,
    evaluable: input.evaluable,
    unevaluableReason: input.unevaluableReason,
  });
}

export async function persistQualificationAdvance(input: {
  db: QualificationDb;
  sessionDate: string;
  nowMs: number;
  evaluations: readonly DayTradeQualificationEvaluation[];
  existing: Map<string, DayTradeQualificationEpisodeState>;
}): Promise<{ symbolsUpdated: number; eventsRecorded: number }> {
  let symbolsUpdated = 0;
  let eventsRecorded = 0;

  for (const evaluation of input.evaluations) {
    const symbol = evaluation.symbol.trim().toUpperCase();
    const prev = input.existing.get(symbol) ??
      emptyQualificationEpisodeState({
        sessionDate: input.sessionDate,
        symbol,
      });
    const stepped = stepDayTradeQualificationLifecycle(prev, evaluation, input.nowMs);

    await input.db.rpc(QUALIFICATION_STATE_UPSERT_RPC, {
      p_row: episodeStateToRow(stepped.state),
    });
    symbolsUpdated += 1;
    input.existing.set(symbol, stepped.state);

    for (const event of stepped.events) {
      const insertRes = await input.db.rpc(QUALIFICATION_EVENT_INSERT_RPC, {
        p_row: {
          session_date: input.sessionDate,
          symbol,
          event_type: event.type,
          event_at: event.atIso,
          dedupe_key: event.dedupeKey,
          payload: event.payload ?? {},
        },
      });
      if (!insertRes.error) eventsRecorded += 1;
    }
  }

  return { symbolsUpdated, eventsRecorded };
}

export async function advanceDayTradeQualificationLifecycle(input: {
  db: QualificationDb;
  sessionDate: string;
  syncRunId: string;
  nowMs: number;
  metricsRows: readonly DayTradeMetricsRow[];
  evaluable?: boolean;
  unevaluableReason?: DayTradeQualificationEvaluation["unevaluableReason"];
  /** Extra symbols to keep evaluating (monitoring / grace / active). */
  watchSymbols?: readonly string[];
}): Promise<{ symbolsUpdated: number; eventsRecorded: number }> {
  const existing = await loadQualificationStatesForSession(input.db, input.sessionDate);
  const evaluable = input.evaluable !== false;

  const symbolSet = new Set<string>();
  for (const row of input.metricsRows) symbolSet.add(row.symbol.trim().toUpperCase());
  for (const [sym, state] of existing) {
    if (state.phase === "ACTIVE" || state.phase === "GRACE" || state.phase === "EXPIRED") {
      symbolSet.add(sym);
    }
  }
  for (const sym of input.watchSymbols ?? []) symbolSet.add(sym.trim().toUpperCase());

  const metricsBySymbol = new Map(
    input.metricsRows.map((row) => [row.symbol.trim().toUpperCase(), row]),
  );

  const evaluations: DayTradeQualificationEvaluation[] = [];
  for (const symbol of symbolSet) {
    const row = metricsBySymbol.get(symbol);
    if (!row) {
      if (existing.get(symbol)?.phase !== "EXPIRED") continue;
      continue;
    }
    evaluations.push(
      buildEvaluationFromMetrics({
        row,
        syncRunId: input.syncRunId,
        evaluable,
        unevaluableReason: input.unevaluableReason,
      }),
    );
  }

  return persistQualificationAdvance({
    db: input.db,
    sessionDate: input.sessionDate,
    nowMs: input.nowMs,
    evaluations,
    existing,
  });
}
