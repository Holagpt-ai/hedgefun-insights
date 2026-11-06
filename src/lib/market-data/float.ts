import { isFiniteNumber } from "@/lib/screeners/contract";
import { getFloat } from "@/lib/polygon";
import { createConcurrencyGate, mapPool } from "./concurrency";
import { uniqueNormalizedSymbols } from "./symbols";

export const FLOAT_STALE_TIME_MS = 18 * 60 * 60 * 1000;
export const FLOAT_FETCH_CONCURRENCY = 4;
export const FLOAT_UNAVAILABLE_MESSAGE = "Float temporarily unavailable";

export type RadarFloatStatus = "ok" | "unavailable";

export interface RadarFloatRecord {
  ticker: string;
  float: number | null;
  asOf: string | null;
  source: "massive_float";
  status: RadarFloatStatus;
}

const floatGate = createConcurrencyGate(FLOAT_FETCH_CONCURRENCY);
const floatMemory = new Map<string, { record: RadarFloatRecord; ts: number }>();
const floatInflight = new Map<string, Promise<RadarFloatRecord>>();

export function resetFloatSymbolCache() {
  floatMemory.clear();
  floatInflight.clear();
}

export function peekFloatRecord(symbol: string): RadarFloatRecord | null {
  const ticker = uniqueNormalizedSymbols([symbol])[0];
  if (!ticker) return null;
  return readCachedFloat(ticker);
}

function finitePositiveShares(value: unknown): number | null {
  if (!isFiniteNumber(value) || (value as number) <= 0) return null;
  return value as number;
}

function asOfFrom(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

/** Provider measurement-effective date (Massive `effective_date`, then legacy fields). */
function measurementDateFromFields(row: Record<string, unknown>): string | null {
  return (
    asOfFrom(row.effective_date) ??
    asOfFrom(row.as_of) ??
    asOfFrom(row.updated) ??
    asOfFrom(row.asOf)
  );
}

function emptyFloat(ticker: string, status: RadarFloatStatus = "unavailable"): RadarFloatRecord {
  return { ticker, float: null, asOf: null, source: "massive_float", status };
}

function envelopeStatus(value: unknown): RadarFloatStatus {
  return value === "unavailable" ? "unavailable" : "ok";
}

/**
 * Map a Massive / Polygon Float payload.
 * Uses free-float fields only. Never substitutes shares outstanding.
 */
export function mapFloatPayload(ticker: string, payload: unknown): RadarFloatRecord {
  const empty = emptyFloat(ticker, "ok");
  if (!payload || typeof payload !== "object") return empty;

  const root = payload as Record<string, unknown>;
  if (root.source === "massive_float") {
    const status = envelopeStatus(root.status);
    const float =
      status === "unavailable"
        ? null
        : finitePositiveShares(root.float) ??
          finitePositiveShares(root.free_float) ??
          finitePositiveShares(root.float_shares);
    return {
      ticker: typeof root.ticker === "string" ? root.ticker : ticker,
      float,
      asOf: measurementDateFromFields(root),
      source: "massive_float",
      status,
    };
  }

  const rawResults = root.results;
  const row =
    Array.isArray(rawResults)
      ? (rawResults.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined)
      : rawResults && typeof rawResults === "object"
        ? (rawResults as Record<string, unknown>)
        : root.ticker || root.float || root.free_float
          ? root
          : undefined;
  if (!row) return empty;

  const float =
    finitePositiveShares(row.float) ??
    finitePositiveShares(row.free_float) ??
    finitePositiveShares(row.float_shares);

  return {
    ticker: typeof row.ticker === "string" ? row.ticker : ticker,
    float,
    asOf: measurementDateFromFields(row),
    source: "massive_float",
    status: "ok",
  };
}

/** Parse provider measurement date (date-only or ISO). Never use market quote as-of. */
export function parseFloatMeasurementMs(asOf: string | null | undefined): number | null {
  if (typeof asOf !== "string" || !asOf.trim()) return null;
  const ms = Date.parse(asOf.trim());
  return Number.isFinite(ms) ? ms : null;
}

/** @deprecated Use {@link parseFloatMeasurementMs}. */
export const parseFloatObservationMs = parseFloatMeasurementMs;

/** Reject future measurement dates (date-only values use UTC midnight). */
export const FLOAT_MEASUREMENT_FUTURE_SLACK_MS = 24 * 60 * 60 * 1000;

export function isFloatMeasurementDateUsable(
  record: RadarFloatRecord,
  nowMs: number = Date.now(),
): boolean {
  const ms = parseFloatMeasurementMs(record.asOf);
  if (ms === null) return false;
  if (ms > nowMs + FLOAT_MEASUREMENT_FUTURE_SLACK_MS) return false;
  return true;
}

export function verifiedFloatRecordForDisplay(
  record: RadarFloatRecord,
  nowMs: number = Date.now(),
): RadarFloatRecord {
  if (record.status === "unavailable" || record.float === null) {
    return record.status === "unavailable"
      ? record
      : { ...record, float: null, status: "unavailable" };
  }
  if (!isFloatMeasurementDateUsable(record, nowMs)) {
    return { ...record, float: null, status: "unavailable" };
  }
  return record;
}

export function verifiedFreeFloatFromRecord(
  record: RadarFloatRecord | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!record) return null;
  const display = verifiedFloatRecordForDisplay(record, nowMs);
  if (display.status === "unavailable" || display.float === null) return null;
  return display.float;
}

function readCachedFloat(ticker: string, nowMs: number = Date.now()): RadarFloatRecord | null {
  const hit = floatMemory.get(ticker);
  if (!hit) return null;
  if (nowMs - hit.ts > FLOAT_STALE_TIME_MS) {
    floatMemory.delete(ticker);
    return null;
  }
  return verifiedFloatRecordForDisplay(hit.record, nowMs);
}

function throwTransientFloat(): never {
  throw new Error(FLOAT_UNAVAILABLE_MESSAGE);
}

export async function getFloatForSymbol(symbol: string): Promise<RadarFloatRecord> {
  const ticker = uniqueNormalizedSymbols([symbol])[0];
  if (!ticker) return emptyFloat("", "ok");

  const cached = readCachedFloat(ticker);
  if (cached) return cached;

  const pending = floatInflight.get(ticker);
  if (pending) return pending;

  const request = (async () => {
    try {
      const payload = await floatGate.run(() => getFloat(ticker));
      const nowMs = Date.now();
      const mapped = mapFloatPayload(ticker, payload);
      const verified = verifiedFloatRecordForDisplay(mapped, nowMs);
      if (verified.status === "unavailable" && mapped.float === null) throwTransientFloat();
      floatMemory.set(ticker, { record: verified, ts: nowMs });
      return verified;
    } catch (error) {
      if (error instanceof Error && error.message === FLOAT_UNAVAILABLE_MESSAGE) throw error;
      throwTransientFloat();
    } finally {
      floatInflight.delete(ticker);
    }
  })();

  floatInflight.set(ticker, request);
  return request;
}

export async function getFloatForSymbols(
  symbols: readonly string[],
  concurrency: number = FLOAT_FETCH_CONCURRENCY,
): Promise<Map<string, RadarFloatRecord>> {
  const unique = uniqueNormalizedSymbols(symbols);
  const rows = await mapPool(unique, concurrency, async (symbol) => {
    try {
      return await getFloatForSymbol(symbol);
    } catch {
      return emptyFloat(symbol, "unavailable");
    }
  });
  const out = new Map<string, RadarFloatRecord>();
  for (const row of rows) {
    if (row.ticker) out.set(row.ticker, row);
  }
  return out;
}

export function floatMapHasTransient(records: Map<string, RadarFloatRecord>, symbols: readonly string[]): boolean {
  return uniqueNormalizedSymbols(symbols).some((symbol) => records.get(symbol)?.status === "unavailable");
}
