export const FLOAT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export type MassiveFloatStatus = "ok" | "unavailable";

export type MassiveFloatRecord = {
  ticker: string;
  float: number | null;
  as_of: string | null;
  source: "massive_float";
  status: MassiveFloatStatus;
};

export function finitePositiveShares(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function emptyFloatRecord(
  ticker: string,
  status: MassiveFloatStatus = "unavailable",
): MassiveFloatRecord {
  return { ticker, float: null, as_of: null, source: "massive_float", status };
}

export function mapMassiveFloat(ticker: string, payload: unknown): MassiveFloatRecord {
  const empty = emptyFloatRecord(ticker, "ok");
  if (!payload || typeof payload !== "object") return empty;
  const root = payload as Record<string, unknown>;
  const rawResults = root.results;
  const row = Array.isArray(rawResults)
    ? (rawResults.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined)
    : rawResults && typeof rawResults === "object"
      ? rawResults as Record<string, unknown>
      : root;
  if (!row) return empty;
  const float =
    finitePositiveShares(row.float) ??
    finitePositiveShares(row.free_float) ??
    finitePositiveShares(row.float_shares);
  const asOf =
    typeof row.as_of === "string" ? row.as_of
    : typeof row.updated === "string" ? row.updated
    : null;
  return { ticker, float, as_of: asOf, source: "massive_float", status: "ok" };
}

/** Cache only HTTP-successful Massive responses. Never long-cache 429/401/5xx. */
export function resolveFloatProviderResult(
  ticker: string,
  res: { ok: boolean; status: number },
  payload: unknown,
): { data: MassiveFloatRecord; cache: boolean } {
  if (!res.ok) {
    return { data: emptyFloatRecord(ticker, "unavailable"), cache: false };
  }
  return { data: mapMassiveFloat(ticker, payload), cache: true };
}

export function rememberFloatIfCacheable(
  cache: Map<string, MassiveFloatRecord>,
  ticker: string,
  result: { data: MassiveFloatRecord; cache: boolean },
): void {
  if (result.cache) cache.set(ticker, result.data);
}
