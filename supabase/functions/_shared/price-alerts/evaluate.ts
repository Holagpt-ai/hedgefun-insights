import type {
  PriceAlertCondition,
  PriceAlertRecurrence,
  PriceAlertStatus,
  QuoteDataLatency,
} from "./types.ts";
import { DEFAULT_COOLDOWN_MINUTES, QUOTE_STALE_MS } from "./types.ts";

export interface QuoteObservation {
  price: number;
  observedAtMs: number;
  latency: QuoteDataLatency;
  sessionNote?: string;
}

export interface AlertEvalInput {
  condition: PriceAlertCondition;
  threshold: number;
  referencePrice: number | null;
  lastObservedPrice: number | null;
  armed: boolean;
  status: PriceAlertStatus;
  recurrence: PriceAlertRecurrence;
  cooldownMinutes: number;
  lastTriggeredAtMs: number | null;
}

export type EvalSkipReason =
  | "paused"
  | "unavailable"
  | "stale"
  | "cooldown"
  | "no_cross"
  | "init_only";

export interface AlertEvalOutcome {
  shouldTrigger: boolean;
  skipReason?: EvalSkipReason;
  nextLastObservedPrice: number;
  nextReferencePrice: number | null;
  nextArmed: boolean;
  nextStatus: PriceAlertStatus;
  observedMovePct: number | null;
}

function percentMove(price: number, reference: number): number {
  return ((price - reference) / reference) * 100;
}

function inCooldown(lastTriggeredAtMs: number | null, cooldownMinutes: number, nowMs: number): boolean {
  if (lastTriggeredAtMs == null) return false;
  return nowMs - lastTriggeredAtMs < cooldownMinutes * 60_000;
}

function isQuoteUsable(quote: QuoteObservation, nowMs: number): boolean {
  if (quote.latency === "unavailable" || !Number.isFinite(quote.price) || quote.price <= 0) {
    return false;
  }
  if (quote.latency === "stale") return false;
  if (nowMs - quote.observedAtMs > QUOTE_STALE_MS) return false;
  return true;
}

function conditionMet(
  condition: PriceAlertCondition,
  price: number,
  threshold: number,
  referencePrice: number | null,
): { met: boolean; movePct: number | null } {
  switch (condition) {
    case "price_above":
      return { met: price > threshold, movePct: null };
    case "price_below":
      return { met: price < threshold, movePct: null };
    case "percent_move_up": {
      if (referencePrice == null || referencePrice <= 0) return { met: false, movePct: null };
      const pct = percentMove(price, referencePrice);
      return { met: pct >= threshold, movePct: pct };
    }
    case "percent_move_down": {
      if (referencePrice == null || referencePrice <= 0) return { met: false, movePct: null };
      const pct = percentMove(price, referencePrice);
      return { met: pct <= -threshold, movePct: pct };
    }
    default:
      return { met: false, movePct: null };
  }
}

function wasConditionMet(
  condition: PriceAlertCondition,
  price: number,
  threshold: number,
  referencePrice: number | null,
): boolean {
  return conditionMet(condition, price, threshold, referencePrice).met;
}

export function evaluatePriceAlert(
  alert: AlertEvalInput,
  quote: QuoteObservation,
  nowMs: number = Date.now(),
): AlertEvalOutcome {
  const price = quote.price;
  let referencePrice = alert.referencePrice;
  if (
    (alert.condition === "percent_move_up" || alert.condition === "percent_move_down") &&
    referencePrice == null &&
    Number.isFinite(price) &&
    price > 0
  ) {
    referencePrice = price;
  }

  const base: AlertEvalOutcome = {
    shouldTrigger: false,
    nextLastObservedPrice: alert.lastObservedPrice ?? price,
    nextReferencePrice: referencePrice,
    nextArmed: alert.armed,
    nextStatus: alert.status,
    observedMovePct: null,
  };

  if (alert.status === "paused") {
    return { ...base, skipReason: "paused" };
  }

  if (!isQuoteUsable(quote, nowMs)) {
    return {
      ...base,
      skipReason: quote.latency === "unavailable" ? "unavailable" : "stale",
    };
  }

  const { met, movePct } = conditionMet(alert.condition, price, alert.threshold, referencePrice);
  base.observedMovePct = movePct;

  if (alert.lastObservedPrice == null) {
    return {
      ...base,
      skipReason: "init_only",
      nextLastObservedPrice: price,
      nextReferencePrice: referencePrice,
      nextArmed: alert.armed,
    };
  }

  if (inCooldown(alert.lastTriggeredAtMs, alert.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES, nowMs)) {
    return {
      ...base,
      skipReason: "cooldown",
      nextLastObservedPrice: price,
      nextReferencePrice: referencePrice,
    };
  }

  const prevMet = wasConditionMet(
    alert.condition,
    alert.lastObservedPrice,
    alert.threshold,
    referencePrice,
  );

  const crossed = met && !prevMet && alert.armed;

  let nextArmed = alert.armed;
  if (crossed) {
    nextArmed = false;
  } else if (!met && !alert.armed) {
    nextArmed = true;
  }

  let nextStatus: PriceAlertStatus = alert.status;
  if (crossed && alert.recurrence === "one_time") {
    nextStatus = "paused";
  }

  return {
    shouldTrigger: crossed,
    skipReason: crossed ? undefined : "no_cross",
    nextLastObservedPrice: price,
    nextReferencePrice: referencePrice,
    nextArmed,
    nextStatus,
    observedMovePct: movePct,
  };
}
