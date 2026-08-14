import type { RadarV22Config } from "./config.ts";
import { providerTimestampMs } from "./time.ts";
import type { AggregateSecondEvent } from "./types.ts";

const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]*$/;
const SYMBOL_MAX_LEN = 12;

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const symbol = raw.trim().toUpperCase();
  if (!symbol || symbol.length > SYMBOL_MAX_LEN) return null;
  if (!SYMBOL_RE.test(symbol)) return null;
  return symbol;
}

function finiteNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function finiteNonNegative(value: unknown): number | null {
  const n = finiteNumber(value);
  if (n === null || n < 0) return null;
  return n;
}

function finitePositive(value: unknown): number | null {
  const n = finiteNumber(value);
  if (n === null || !(n > 0)) return null;
  return n;
}

function isValidOhlc(
  open: number,
  high: number,
  low: number,
  close: number,
): boolean {
  if (![open, high, low, close].every((v) => Number.isFinite(v) && v > 0)) {
    return false;
  }
  return low <= high && low <= open && low <= close && high >= open &&
    high >= close;
}

/**
 * Parse a Polygon/Massive second aggregate (ev=A). Invalid events return null.
 * Does not log raw payloads.
 */
export function parseAggregateEvent(
  raw: unknown,
): AggregateSecondEvent | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  if (row.ev !== "A") return null;
  const sym = normalizeSymbol(row.sym);
  if (!sym) return null;
  const startMs = providerTimestampMs(row.s);
  const endMs = providerTimestampMs(row.e);
  if (startMs === null || endMs === null) return null;
  if (!(endMs > startMs)) return null;
  const volume = finiteNonNegative(row.v);
  if (volume === null) return null;

  const open = finitePositive(row.o);
  const high = finitePositive(row.h);
  const low = finitePositive(row.l);
  const close = finitePositive(row.c);
  const ohlcOk = open !== null && high !== null && low !== null &&
    close !== null &&
    isValidOhlc(open, high, low, close);

  return {
    ev: "A",
    sym,
    v: volume,
    av: finiteNonNegative(row.av),
    op: finitePositive(row.op),
    vw: finitePositive(row.vw),
    o: ohlcOk ? open : null,
    c: ohlcOk ? close : null,
    h: ohlcOk ? high : null,
    l: ohlcOk ? low : null,
    a: finitePositive(row.a),
    z: finiteNonNegative(row.z),
    s: startMs,
    e: endMs,
  };
}

export function wsUrlForMode(mode: "delayed" | "realtime"): string {
  return mode === "realtime"
    ? "wss://socket.massive.com/stocks"
    : "wss://delayed.massive.com/stocks";
}

export function authMessage(apiKey: string): string {
  return JSON.stringify({ action: "auth", params: apiKey });
}

export function subscribeMessage(): string {
  return JSON.stringify({ action: "subscribe", params: "A.*" });
}

export function reconnectDelayMs(
  attempt: number,
  config: Pick<
    RadarV22Config,
    "reconnectBaseDelayMs" | "reconnectMaxDelayMs" | "reconnectJitter"
  >,
  random: () => number = Math.random,
): number {
  const exp = Math.min(
    config.reconnectMaxDelayMs,
    config.reconnectBaseDelayMs * 2 ** Math.max(0, attempt - 1),
  );
  const spread = exp * config.reconnectJitter * (random() * 2 - 1);
  return Math.max(0, Math.round(exp + spread));
}
