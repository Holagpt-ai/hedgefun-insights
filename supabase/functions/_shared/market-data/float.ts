export function finitePositiveShares(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function mapMassiveFloat(ticker: string, payload: unknown): {
  ticker: string;
  float: number | null;
  as_of: string | null;
  source: "massive_float";
} {
  const empty = { ticker, float: null, as_of: null as string | null, source: "massive_float" as const };
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
  return { ticker, float, as_of: asOf, source: "massive_float" };
}
