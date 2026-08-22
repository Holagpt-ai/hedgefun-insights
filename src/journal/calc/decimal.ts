/**
 * Decimal-safe financial arithmetic for the Journal calculation engine.
 * Values are stored as integer micros (1e6) so display rounding never feeds
 * downstream calculations.
 */
export const MONEY_SCALE = 1_000_000n;
export const CALC_VERSION = "journal-calc.v1";
export const INPUT_VERSION = "journal-input.v1";

const SCALE_NUM = Number(MONEY_SCALE);

export type Micros = bigint;

export function parseDecimal(input: number | string): Micros {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new Error("Non-finite numeric input");
    }
    return parseDecimal(input.toString());
  }
  const raw = input.trim();
  if (!raw) return 0n;
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [wholePart, fracPart = ""] = unsigned.split(".");
  const whole = BigInt(wholePart || "0");
  const fracPadded = (fracPart + "000000").slice(0, 6);
  const frac = BigInt(fracPadded);
  const value = whole * MONEY_SCALE + frac;
  return negative ? -value : value;
}

export function microsToNumber(value: Micros): number {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / MONEY_SCALE;
  const frac = abs % MONEY_SCALE;
  const asNumber = Number(whole) + Number(frac) / SCALE_NUM;
  return negative ? -asNumber : asNumber;
}

export function add(a: Micros, b: Micros): Micros {
  return a + b;
}

export function sub(a: Micros, b: Micros): Micros {
  return a - b;
}

export function mul(a: Micros, b: Micros): Micros {
  return (a * b) / MONEY_SCALE;
}

export function mulInt(a: Micros, n: bigint): Micros {
  return a * n;
}

export function div(a: Micros, b: Micros): Micros {
  if (b === 0n) {
    throw new Error("Division by zero");
  }
  return (a * MONEY_SCALE) / b;
}

export function abs(a: Micros): Micros {
  return a < 0n ? -a : a;
}

export function cmp(a: Micros, b: Micros): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function roundToCents(value: Micros): Micros {
  const sign = value < 0n ? -1n : 1n;
  const absVal = value < 0n ? -value : value;
  const centsScale = 10_000n;
  const remainder = absVal % centsScale;
  const half = centsScale / 2n;
  const rounded = remainder >= half ? absVal + (centsScale - remainder) : absVal - remainder;
  return rounded * sign;
}

export function formatMoney(value: Micros, locale = "en-US", currency = "USD"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(microsToNumber(value));
}
