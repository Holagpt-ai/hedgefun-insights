import {
  buildDayTradeQualificationEvaluation,
  resolveMarketDataMs,
  type DayTradeMetricsRow,
} from "./evaluate-five-pillars.ts";
import { assessMetricsEvaluability } from "./evaluate-five-pillars.ts";
import { computeAuthoritativeDeskMembership } from "./desk-membership.ts";
import {
  emptyQualificationEpisodeState,
  stepDayTradeQualificationLifecycle,
  type DayTradeQualificationEpisodeState,
  type DayTradeQualificationEvaluation,
} from "./qualification-lifecycle.ts";

export const QUALIFICATION_STATE_UPSERT_RPC = "day_trade_qualification_state_upsert_v1";
export const QUALIFICATION_EVENT_INSERT_RPC = "day_trade_qualification_event_insert_v1";
export const QUALIFICATION_LIST_RPC = "day_trade_qualification_list_v1";
export const QUALIFICATION_APPLY_BATCH_RPC = "day_trade_qualification_apply_batch_v1";

export class QualificationPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QualificationPersistenceError";
  }
}

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
    pillarPhase: ((row.pillar_phase ?? row.phase) as DayTradeQualificationEpisodeState["pillarPhase"]) ??
      null,
    firstQualifiedAt: row.first_qualified_at ? String(row.first_qualified_at) : null,
    lastQualifiedAt: row.last_qualified_at ? String(row.last_qualified_at) : null,
    graceFirstFailureAt: row.grace_first_failure_at
      ? String(row.grace_first_failure_at)
      : null,
    graceFailureCount: Number(row.grace_failure_count ?? 0),
    pillarExpiredAt: row.pillar_expired_at
      ? String(row.pillar_expired_at)
      : row.expired_at
        ? String(row.expired_at)
        : null,
    pillarExpirationReasonCodes: Array.isArray(row.pillar_expiration_reason_codes)
      ? (row.pillar_expiration_reason_codes as string[])
      : Array.isArray(row.expiration_reason_codes)
        ? (row.expiration_reason_codes as string[])
        : [],
    everOnDesk: Boolean(row.ever_on_desk),
    currentlyOnDesk: Boolean(row.currently_on_desk),
    firstDeskAt: row.first_desk_at ? String(row.first_desk_at) : null,
    lastDeskAt: row.last_desk_at ? String(row.last_desk_at) : null,
    lastDeskDepartureAt: row.last_desk_departure_at
      ? String(row.last_desk_departure_at)
      : null,
    lastDeskDepartureReason: row.last_desk_departure_reason
      ? (String(row.last_desk_departure_reason) as DayTradeQualificationEpisodeState["lastDeskDepartureReason"])
      : null,
    fivePillarsPass: Boolean(row.five_pillars_pass),
    monitoringEligible: Boolean(row.monitoring_eligible),
    monitoringDataStatus:
      (row.monitoring_data_status as DayTradeQualificationEpisodeState["monitoringDataStatus"]) ??
        "UNAVAILABLE",
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
    pillar_phase: state.pillarPhase,
    first_qualified_at: state.firstQualifiedAt,
    last_qualified_at: state.lastQualifiedAt,
    grace_first_failure_at: state.graceFirstFailureAt,
    grace_failure_count: state.graceFailureCount,
    pillar_expired_at: state.pillarExpiredAt,
    pillar_expiration_reason_codes: state.pillarExpirationReasonCodes,
    ever_on_desk: state.everOnDesk,
    currently_on_desk: state.currentlyOnDesk,
    first_desk_at: state.firstDeskAt,
    last_desk_at: state.lastDeskAt,
    last_desk_departure_at: state.lastDeskDepartureAt,
    last_desk_departure_reason: state.lastDeskDepartureReason,
    five_pillars_pass: state.fivePillarsPass,
    monitoring_eligible: state.monitoringEligible,
    monitoring_data_status: state.monitoringDataStatus,
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
  if (res.error) {
    throw new QualificationPersistenceError(
      `load_failed:${res.error.message}`,
    );
  }
  if (!Array.isArray(res.data)) {
    throw new QualificationPersistenceError("load_failed:invalid_response");
  }
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
  marketDataMs: number;
  onAuthoritativeDesk: boolean;
  freshnessPass: boolean;
  opportunityEligible: boolean;
  deskObservationComplete: boolean;
}): DayTradeQualificationEvaluation {
  const snapshotKey = `${input.syncRunId}:${input.row.symbol}:${input.row.provider_as_of ?? "none"}`;
  const evaluable = assessMetricsEvaluability(input.row, input.marketDataMs);
  const base = buildDayTradeQualificationEvaluation({
    row: input.row,
    marketDataMs: input.marketDataMs,
    snapshotKey,
    evaluable: evaluable.evaluable,
    unevaluableReason: evaluable.unevaluableReason,
  });
  return {
    ...base,
    onAuthoritativeDesk: input.onAuthoritativeDesk,
    freshnessPass: input.freshnessPass,
    opportunityEligible: input.opportunityEligible,
    deskObservationComplete: input.deskObservationComplete,
  };
}

export async function persistQualificationAdvance(input: {
  db: QualificationDb;
  sessionDate: string;
  evaluations: readonly DayTradeQualificationEvaluation[];
  existing: Map<string, DayTradeQualificationEpisodeState>;
}): Promise<{ symbolsUpdated: number; eventsRecorded: number }> {
  const batch: Record<string, unknown>[] = [];
  let eventsRecorded = 0;

  for (const evaluation of input.evaluations) {
    const symbol = evaluation.symbol.trim().toUpperCase();
    const prev = input.existing.get(symbol) ??
      emptyQualificationEpisodeState({
        sessionDate: input.sessionDate,
        symbol,
      });
    if (
      prev.lastMarketDataMs !== null &&
      evaluation.evaluable &&
      evaluation.marketDataMs < prev.lastMarketDataMs
    ) {
      continue;
    }
    const stepped = stepDayTradeQualificationLifecycle(prev, evaluation);
    input.existing.set(symbol, stepped.state);

    batch.push({
      state: episodeStateToRow(stepped.state),
      events: stepped.events.map((event) => ({
        session_date: input.sessionDate,
        symbol,
        event_type: event.type,
        event_at: event.atIso,
        dedupe_key: event.dedupeKey,
        payload: event.payload ?? {},
      })),
    });
    eventsRecorded += stepped.events.length;
  }

  if (batch.length === 0) return { symbolsUpdated: 0, eventsRecorded: 0 };

  const res = await input.db.rpc(QUALIFICATION_APPLY_BATCH_RPC, { p_batch: batch });
  if (res.error) {
    throw new QualificationPersistenceError(`apply_failed:${res.error.message}`);
  }

  return { symbolsUpdated: batch.length, eventsRecorded };
}

export async function advanceDayTradeQualificationLifecycle(input: {
  db: QualificationDb;
  sessionDate: string;
  syncRunId: string;
  metricsRows: readonly DayTradeMetricsRow[];
  watchSymbols?: readonly string[];
}): Promise<{ symbolsUpdated: number; eventsRecorded: number }> {
  const existing = await loadQualificationStatesForSession(input.db, input.sessionDate);

  const symbolSet = new Set<string>();
  for (const row of input.metricsRows) symbolSet.add(row.symbol.trim().toUpperCase());
  for (const [sym, state] of existing) {
    if (state.monitoringEligible || state.currentlyOnDesk || state.pillarPhase) {
      symbolSet.add(sym);
    }
  }
  for (const sym of input.watchSymbols ?? []) symbolSet.add(sym.trim().toUpperCase());

  const marketDataMsBySymbol = new Map<string, number>();
  for (const row of input.metricsRows) {
    const ms = resolveMarketDataMs(row.provider_as_of);
    if (ms !== null) marketDataMsBySymbol.set(row.symbol.trim().toUpperCase(), ms);
  }

  const desk = computeAuthoritativeDeskMembership({
    rows: input.metricsRows,
    marketDataMsBySymbol,
  });

  const metricsBySymbol = new Map(
    input.metricsRows.map((row) => [row.symbol.trim().toUpperCase(), row]),
  );

  const evaluations: DayTradeQualificationEvaluation[] = [];
  for (const symbol of symbolSet) {
    const prev = existing.get(symbol);
    const row = metricsBySymbol.get(symbol);
    if (!row) {
      if (prev?.monitoringEligible || prev?.currentlyOnDesk) {
        evaluations.push({
          symbol,
          deskObservationComplete: false,
          evaluable: false,
          unevaluableReason: "missing_data",
          fivePillarsPass: prev.fivePillarsPass,
          pillarOutcomes: prev.pillarOutcomes ?? {
            price: "unavailable",
            move: "unavailable",
            float: "unavailable",
            participation: "unavailable",
            freshness: "unavailable",
          },
          reasonCodes: ["MISSING_REQUIRED_DATA"],
          marketDataMs: prev.lastMarketDataMs ?? 0,
          snapshotKey: prev.lastSnapshotKey ?? `${input.syncRunId}:${symbol}:missing`,
          monitoredPrice: prev.monitoredPrice,
          monitoredVolume: prev.monitoredVolume,
          providerAsOfIso: prev.providerAsOfIso,
          onAuthoritativeDesk: prev.currentlyOnDesk,
          freshnessPass: prev.fivePillarsPass,
          opportunityEligible: false,
        });
      }
      continue;
    }
    const marketDataMs = marketDataMsBySymbol.get(symbol);
    if (marketDataMs === undefined) continue;
    const deskObservationComplete = desk.universeSymbols.has(symbol);
    const deskFacts = desk.bySymbol.get(symbol) ?? {
      onAuthoritativeDesk: false,
      fivePillarsPass: false,
      freshnessPass: false,
      opportunityEligible: false,
      opportunityScore: 0,
    };
    const onDesk = deskObservationComplete
      ? deskFacts.onAuthoritativeDesk
      : (prev?.currentlyOnDesk ?? false);
    evaluations.push(
      buildEvaluationFromMetrics({
        row,
        syncRunId: input.syncRunId,
        marketDataMs,
        onAuthoritativeDesk: onDesk,
        freshnessPass: deskFacts.freshnessPass,
        opportunityEligible: deskFacts.opportunityEligible,
        deskObservationComplete,
      }),
    );
  }

  return persistQualificationAdvance({
    db: input.db,
    sessionDate: input.sessionDate,
    evaluations,
    existing,
  });
}
