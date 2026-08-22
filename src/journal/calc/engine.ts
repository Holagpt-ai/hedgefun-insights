import {
  abs,
  add,
  CALC_VERSION,
  INPUT_VERSION,
  MONEY_SCALE,
  microsToNumber,
  parseDecimal,
  sub,
  type Micros,
} from "./decimal";
import { resolveInitialRisk } from "./planned-risk";
import type {
  AggregateMetrics,
  BreakevenMode,
  DailyMetric,
  ExecutionInput,
  PositionResult,
  TradeCalculation,
  TradeInput,
} from "./types";

export const BREAKEVEN_R_DEFAULT = 0.05;
export const BREAKEVEN_CURRENCY_DEFAULT = parseDecimal("0.01");
export const RECONCILIATION_TOLERANCE = parseDecimal("1");

interface Lot {
  qty: Micros;
  price: Micros;
}

function unscaled(value: Micros): bigint {
  return value / MONEY_SCALE;
}

function fillNotional(price: Micros, qty: Micros, multiplier: bigint): Micros {
  return (price * qty * multiplier) / MONEY_SCALE;
}

function realizedDelta(
  direction: TradeInput["direction"],
  entryPrice: Micros,
  exitPrice: Micros,
  qty: Micros,
  multiplier: bigint,
): Micros {
  const delta = ((exitPrice - entryPrice) * qty * multiplier) / MONEY_SCALE;
  return direction === "long" ? delta : -delta;
}

function feeTotal(execution: ExecutionInput): { fees: Micros; incomplete: boolean } {
  let fees = 0n;
  let incomplete = false;
  const addFee = (value?: number | string) => {
    if (value === undefined || value === null || value === "") return;
    fees = add(fees, parseDecimal(value));
  };
  addFee(execution.commission);
  addFee(execution.regulatoryFee);
  addFee(execution.otherFee);
  for (const fee of execution.fees ?? []) {
    if (fee.accountCurrencyAmount != null && fee.accountCurrencyAmount !== "") {
      fees = add(fees, parseDecimal(fee.accountCurrencyAmount));
      continue;
    }
    if (
      fee.nativeCurrency &&
      fee.currency &&
      fee.nativeCurrency !== fee.currency &&
      fee.conversionRate == null
    ) {
      incomplete = true;
      continue;
    }
    addFee(fee.amount);
  }
  return { fees, incomplete };
}

function isOpening(action: ExecutionInput["action"], direction: TradeInput["direction"]): boolean {
  return direction === "long" ? action === "buy" : action === "short";
}

function tradeMultiplier(trade: TradeInput, execution: ExecutionInput): bigint {
  const raw = execution.multiplier ?? trade.legs?.[0]?.multiplier ?? 1;
  return unscaled(parseDecimal(raw)) || 1n;
}

export function validateSymbol(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const symbol = raw.trim().toUpperCase();
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) ? symbol : null;
}

export function calculatePosition(
  trade: TradeInput,
  options?: { allowReversal?: boolean },
): PositionResult {
  const exclusions: string[] = [];
  const executions = [...trade.executions].sort((a, b) =>
    a.timestampUtc.localeCompare(b.timestampUtc),
  );

  if (executions.length === 0) {
    return emptyPosition(trade, ["no_executions"], "unavailable");
  }

  const lots: Lot[] = [];
  let gross = 0n;
  let totalFees = 0n;
  let feesIncomplete = Boolean(trade.feesIncomplete);
  let closedQty = 0n;
  let openedQty = 0n;
  let entryNotional = 0n;
  let exitNotional = 0n;
  let exitPxQty = 0n;
  let entryPxQty = 0n;
  let firstOpen: string | null = null;
  let lastClose: string | null = null;
  let overExitBlocked = false;

  for (const execution of executions) {
    const qty = parseDecimal(execution.quantity);
    const price = parseDecimal(execution.price);
    const multiplier = tradeMultiplier(trade, execution);
    const { fees, incomplete } = feeTotal(execution);
    totalFees = add(totalFees, fees);
    feesIncomplete = feesIncomplete || incomplete;

    if (isOpening(execution.action, trade.direction)) {
      lots.push({ qty, price });
      openedQty = add(openedQty, qty);
      entryNotional = add(entryNotional, fillNotional(price, qty, multiplier));
      entryPxQty = add(entryPxQty, (price * qty) / MONEY_SCALE);
      firstOpen = firstOpen ?? execution.timestampUtc;
      continue;
    }

    const openQty = lots.reduce((sum, lot) => add(sum, lot.qty), 0n);
    let remainingToClose = qty;
    if (remainingToClose > openQty) {
      if (!options?.allowReversal) {
        overExitBlocked = true;
        exclusions.push("over_exit_blocked");
        remainingToClose = openQty;
      }
    }

    let leftover = remainingToClose;
    while (leftover > 0n && lots.length > 0) {
      const lot = lots[0];
      const matched = leftover < lot.qty ? leftover : lot.qty;
      gross = add(gross, realizedDelta(trade.direction, lot.price, price, matched, multiplier));
      exitNotional = add(exitNotional, fillNotional(price, matched, multiplier));
      exitPxQty = add(exitPxQty, (price * matched) / MONEY_SCALE);
      closedQty = add(closedQty, matched);
      lot.qty = sub(lot.qty, matched);
      leftover = sub(leftover, matched);
      lastClose = execution.timestampUtc;
      if (lot.qty === 0n) lots.shift();
    }
  }

  const remainingQuantity = lots.reduce((sum, lot) => add(sum, lot.qty), 0n);
  const net = sub(gross, totalFees);
  const resolvedRisk = resolveInitialRisk(trade);
  const initialRisk = resolvedRisk.initialRisk;
  const rMultiple =
    initialRisk && initialRisk !== 0n ? microsToNumber(net) / microsToNumber(initialRisk) : null;
  const returnOnNotional =
    entryNotional !== 0n ? microsToNumber(net) / microsToNumber(entryNotional) : null;
  const returnOnDefinedRisk = rMultiple;

  let holdingDurationMinutes: number | null = null;
  if (firstOpen && lastClose) {
    holdingDurationMinutes = Math.round((Date.parse(lastClose) - Date.parse(firstOpen)) / 60000);
  }

  let calculationState: PositionResult["calculationState"] = "authoritative";
  if (feesIncomplete) {
    calculationState = "incomplete";
    exclusions.push("missing_fee_conversion");
  }
  if (trade.excludedFromAnalytics) {
    exclusions.push(trade.exclusionReason || "excluded_from_analytics");
  }

  const weightedAverageEntry =
    openedQty === 0n ? null : (entryPxQty * MONEY_SCALE) / openedQty;
  const weightedAverageExit =
    closedQty === 0n ? null : (exitPxQty * MONEY_SCALE) / closedQty;

  const outcome =
    remainingQuantity > 0n && closedQty === 0n
      ? "open"
      : classifyOutcome(net, rMultiple, remainingQuantity);

  return {
    openQuantity: openedQty,
    closedQuantity: closedQty,
    remainingQuantity,
    weightedAverageEntry,
    weightedAverageExit,
    entryNotional,
    exitNotional,
    grossRealizedPnl: gross,
    totalFees,
    feeDrag: totalFees,
    netRealizedPnl: net,
    holdingDurationMinutes,
    initialRisk,
    riskPerShare: resolvedRisk.riskPerShare,
    plannedRiskSource: resolvedRisk.source,
    rMultiple,
    returnOnNotional,
    returnOnDefinedRisk,
    outcome,
    calculationState,
    exclusions,
    overExitBlocked,
  };
}

function emptyPosition(
  trade: TradeInput,
  exclusions: string[],
  calculationState: PositionResult["calculationState"],
): PositionResult {
  const resolvedRisk = resolveInitialRisk(trade);
  return {
    openQuantity: 0n,
    closedQuantity: 0n,
    remainingQuantity: 0n,
    weightedAverageEntry: null,
    weightedAverageExit: null,
    entryNotional: 0n,
    exitNotional: 0n,
    grossRealizedPnl: 0n,
    totalFees: 0n,
    feeDrag: 0n,
    netRealizedPnl: 0n,
    holdingDurationMinutes: null,
    initialRisk: resolvedRisk.initialRisk,
    riskPerShare: resolvedRisk.riskPerShare,
    plannedRiskSource: resolvedRisk.source,
    rMultiple: null,
    returnOnNotional: null,
    returnOnDefinedRisk: null,
    outcome: "excluded",
    calculationState,
    exclusions,
    overExitBlocked: false,
  };
}

export function classifyOutcome(
  net: Micros,
  rMultiple: number | null,
  remainingQuantity: Micros,
  options?: { mode?: BreakevenMode; rThreshold?: number; currencyTolerance?: Micros },
): PositionResult["outcome"] {
  if (remainingQuantity > 0n && net === 0n) return "open";
  const mode = options?.mode ?? "r";
  if (mode === "r" && rMultiple != null) {
    if (Math.abs(rMultiple) <= (options?.rThreshold ?? BREAKEVEN_R_DEFAULT)) return "breakeven";
  } else if (mode === "currency") {
    const tolerance = options?.currencyTolerance ?? BREAKEVEN_CURRENCY_DEFAULT;
    if (abs(net) <= tolerance) return "breakeven";
  } else if (mode === "strict_zero") {
    if (net === 0n) return "breakeven";
  }
  if (net > 0n) return "win";
  if (net < 0n) return "loss";
  return "breakeven";
}

export function calculateTrade(trade: TradeInput): TradeCalculation {
  const position = calculatePosition(trade);
  const derivedStatus =
    position.remainingQuantity > 0n && position.closedQuantity > 0n
      ? "partially_closed"
      : position.remainingQuantity > 0n
        ? "open"
        : trade.status === "closed_before_expiration"
          ? "closed_before_expiration"
          : "closed";
  return {
    ...position,
    tradeId: trade.id,
    symbol: trade.symbol,
    assetClass: trade.assetClass,
    direction: trade.direction,
    status: derivedStatus,
    sessionDate: trade.sessionDate ?? null,
    playbookName: trade.playbookName ?? null,
    calculationVersion: CALC_VERSION,
    inputVersion: INPUT_VERSION,
  };
}

function isClosedForAnalytics(calc: TradeCalculation): boolean {
  if (calc.exclusions.includes("excluded_from_analytics") || calc.calculationState === "unavailable") {
    return false;
  }
  return calc.closedQuantity > 0n && calc.remainingQuantity === 0n;
}

export function aggregateTrades(trades: TradeInput[]): AggregateMetrics {
  const calcs = trades.map(calculateTrade);
  const exclusionReasons: Record<string, number> = {};
  const included: TradeCalculation[] = [];
  for (const calc of calcs) {
    if (!isClosedForAnalytics(calc)) {
      for (const reason of calc.exclusions) {
        exclusionReasons[reason] = (exclusionReasons[reason] ?? 0) + 1;
      }
      if (calc.remainingQuantity > 0n) {
        exclusionReasons.open_or_partial = (exclusionReasons.open_or_partial ?? 0) + 1;
      }
      continue;
    }
    included.push(calc);
  }

  let gross = 0n;
  let fees = 0n;
  let net = 0n;
  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let rSum = 0;
  let rCount = 0;
  let winSum = 0n;
  let lossSum = 0n;
  let largestWin: AggregateMetrics["largestWin"] = null;
  let largestLoss: AggregateMetrics["largestLoss"] = null;

  for (const calc of included) {
    gross = add(gross, calc.grossRealizedPnl);
    fees = add(fees, calc.totalFees);
    net = add(net, calc.netRealizedPnl);
    if (calc.outcome === "win") {
      wins += 1;
      winSum = add(winSum, calc.netRealizedPnl);
      if (!largestWin || calc.netRealizedPnl > largestWin.net) {
        largestWin = { tradeId: calc.tradeId, symbol: calc.symbol, net: calc.netRealizedPnl };
      }
    } else if (calc.outcome === "loss") {
      losses += 1;
      lossSum = add(lossSum, calc.netRealizedPnl);
      if (!largestLoss || calc.netRealizedPnl < largestLoss.net) {
        largestLoss = { tradeId: calc.tradeId, symbol: calc.symbol, net: calc.netRealizedPnl };
      }
    } else if (calc.outcome === "breakeven") {
      breakevens += 1;
    }
    if (calc.rMultiple != null) {
      rSum += calc.rMultiple;
      rCount += 1;
    }
  }

  const closedForWinRate = wins + losses;
  const profitFactor =
    lossSum === 0n ? null : microsToNumber(winSum) / Math.abs(microsToNumber(lossSum));
  const expectancyMean = included.length === 0 ? null : net / BigInt(included.length);

  return {
    tradeCount: trades.length,
    includedCount: included.length,
    excludedCount: trades.length - included.length,
    exclusionReasons,
    wins,
    losses,
    breakevens,
    winRate: closedForWinRate === 0 ? null : wins / closedForWinRate,
    grossPnl: gross,
    fees,
    netPnl: net,
    profitFactor,
    expectancyDollars: expectancyMean,
    expectancyR: rCount === 0 || included.length === 0 ? null : rSum / included.length,
    averageR: rCount === 0 ? null : rSum / rCount,
    averageWin: wins === 0 ? null : winSum / BigInt(wins),
    averageLoss: losses === 0 ? null : lossSum / BigInt(losses),
    largestWin,
    largestLoss,
    sampleSize: included.length,
    calculationState: included.some((item) => item.calculationState !== "authoritative")
      ? "estimated"
      : "authoritative",
    calculationVersion: CALC_VERSION,
  };
}

export function dailyMetrics(trades: TradeInput[]): DailyMetric[] {
  const byDate = new Map<string, TradeInput[]>();
  for (const trade of trades) {
    const date = trade.sessionDate ?? trade.executions[0]?.timestampUtc.slice(0, 10);
    if (!date) continue;
    const list = byDate.get(date) ?? [];
    list.push(trade);
    byDate.set(date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayTrades]) => {
      const metrics = aggregateTrades(dayTrades);
      return {
        date,
        netPnl: metrics.netPnl,
        grossPnl: metrics.grossPnl,
        fees: metrics.fees,
        tradeCount: metrics.includedCount,
        wins: metrics.wins,
        losses: metrics.losses,
        breakevens: metrics.breakevens,
        averageR: metrics.averageR,
      };
    });
}

export function realizedDrawdown(daily: DailyMetric[]): {
  maxDrawdown: Micros;
  recoveryFactor: number | null;
} {
  let peak = 0n;
  let equity = 0n;
  let maxDd = 0n;
  for (const day of daily) {
    equity = add(equity, day.netPnl);
    if (equity > peak) peak = equity;
    const dd = sub(peak, equity);
    if (dd > maxDd) maxDd = dd;
  }
  const totalNet = daily.reduce((sum, day) => add(sum, day.netPnl), 0n);
  const recoveryFactor =
    maxDd === 0n ? null : microsToNumber(totalNet) / microsToNumber(maxDd);
  return { maxDrawdown: maxDd, recoveryFactor };
}
