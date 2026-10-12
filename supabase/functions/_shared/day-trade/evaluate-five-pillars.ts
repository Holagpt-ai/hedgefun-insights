/**
 * Backend Five Pillars evaluation aligned with frontend day-trade-strategy momentum gates.
 */

import type {
  DayTradePillarOutcomes,
  DayTradeQualificationEvaluation,
} from "./qualification-lifecycle.ts";

export type DayTradeMetricsRow = {
  symbol: string;
  price: number | null;
  change_percent: number | null;
  float_shares: number | null;
  volume_ratio_prior_session: number | null;
  prior_session_volume: number | null;
  rvol_5m: number | null;
  time_adjusted_rvol: number | null;
  rvol_20d: number | null;
  avg_volume_20d: number | null;
  volume: number | null;
  provider_as_of: string | null;
};

const PRICE_MIN = 2;
const PRICE_MAX = 20;
const MOVE_MIN_PCT = 10;
const FLOAT_MAX = 10_000_000;
const RVOL_MIN = 5;

function finite(n: unknown): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function pillarOutcomes(row: DayTradeMetricsRow): DayTradePillarOutcomes {
  const price = finite(row.price);
  const move = finite(row.change_percent);
  const floatShares = finite(row.float_shares);

  let priceGate: DayTradePillarOutcomes["price"] = "unavailable";
  if (price !== null) priceGate = price >= PRICE_MIN && price <= PRICE_MAX ? "pass" : "fail";

  let moveGate: DayTradePillarOutcomes["move"] = "unavailable";
  if (move !== null) moveGate = move >= MOVE_MIN_PCT ? "pass" : "fail";

  let floatGate: DayTradePillarOutcomes["float"] = "unavailable";
  if (floatShares !== null) {
    floatGate = floatShares > FLOAT_MAX ? "fail" : "pass";
  }

  const participationSignals: { available: boolean; trusted: boolean; pass: boolean }[] = [];

  const ratio = finite(row.volume_ratio_prior_session);
  const priorVol = finite(row.prior_session_volume);
  if (ratio !== null && priorVol !== null && priorVol > 0) {
    participationSignals.push({
      available: true,
      trusted: true,
      pass: ratio >= RVOL_MIN,
    });
  }

  const rvol5 = finite(row.rvol_5m);
  if (rvol5 !== null) {
    participationSignals.push({ available: true, trusted: true, pass: rvol5 >= RVOL_MIN });
  }

  const tarvol = finite(row.time_adjusted_rvol);
  if (tarvol !== null) {
    participationSignals.push({ available: true, trusted: true, pass: tarvol >= RVOL_MIN });
  }

  const rvol20 = finite(row.rvol_20d);
  const avg20 = finite(row.avg_volume_20d);
  if (rvol20 !== null && avg20 !== null && avg20 > 0) {
    participationSignals.push({ available: true, trusted: true, pass: rvol20 >= RVOL_MIN });
  }

  let participationGate: DayTradePillarOutcomes["participation"] = "unavailable";
  if (participationSignals.some((s) => s.available)) {
    participationGate = participationSignals.some((s) => s.trusted && s.pass) ? "pass" : "fail";
  }

  return {
    price: priceGate,
    move: moveGate,
    float: floatGate,
    participation: participationGate,
    freshness: "pass",
  };
}

function rejectionReasons(outcomes: DayTradePillarOutcomes): string[] {
  const codes: string[] = [];
  if (outcomes.price === "unavailable") codes.push("MISSING_REQUIRED_DATA");
  else if (outcomes.price === "fail") codes.push("PRICE_OUT_OF_RANGE");
  if (outcomes.move === "unavailable") codes.push("MISSING_REQUIRED_DATA");
  else if (outcomes.move === "fail") codes.push("MOMENTUM_TOO_WEAK");
  if (outcomes.float === "fail") codes.push("FLOAT_TOO_HIGH");
  if (outcomes.participation === "unavailable") codes.push("MISSING_REQUIRED_DATA");
  else if (outcomes.participation === "fail") codes.push("INSUFFICIENT_RVOL");
  return [...new Set(codes)];
}

function momentumPass(outcomes: DayTradePillarOutcomes): boolean {
  return (
    outcomes.price === "pass" &&
    outcomes.move === "pass" &&
    outcomes.float !== "fail" &&
    outcomes.participation === "pass"
  );
}

export function buildDayTradeQualificationEvaluation(input: {
  row: DayTradeMetricsRow;
  marketDataMs: number;
  snapshotKey: string;
  evaluable: boolean;
  unevaluableReason?: DayTradeQualificationEvaluation["unevaluableReason"];
}): DayTradeQualificationEvaluation {
  const outcomes = pillarOutcomes(input.row);
  const pass = momentumPass(outcomes);
  return {
    symbol: input.row.symbol.trim().toUpperCase(),
    evaluable: input.evaluable,
    unevaluableReason: input.unevaluableReason,
    fivePillarsPass: pass,
    pillarOutcomes: outcomes,
    reasonCodes: pass ? [] : rejectionReasons(outcomes),
    marketDataMs: input.marketDataMs,
    snapshotKey: input.snapshotKey,
    monitoredPrice: finite(input.row.price),
    monitoredVolume: finite(input.row.volume) !== null ? Math.trunc(finite(input.row.volume)!) : null,
    providerAsOfIso: input.row.provider_as_of,
  };
}
