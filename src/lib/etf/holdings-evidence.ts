/**
 * ETF constituent evidence.
 * A holding is shown only when a verified source supplies both identity and weight.
 * Related-company records and rank-based ladders are never constituents.
 */

const SYMBOL_RE = /^[A-Z][A-Z0-9.]{0,9}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERCENT_TEXT_RE = /^(\d+(\.\d+)?)%$/;

/** Rank ladder previously invented as `10 - i * 0.8`. */
const SYNTHETIC_WEIGHT_ORIGIN = 10;
const SYNTHETIC_WEIGHT_STEP = 0.8;

export interface VerifiedHolding {
  symbol: string;
  name: string | null;
  weightPercent: number;
}

export type HoldingsEvidence =
  | {
      status: "available";
      holdings: VerifiedHolding[];
      source: string;
      asOf: string | null;
    }
  | {
      status: "unavailable";
      reason: "no_verified_feed" | "related_companies" | "static_catalog" | "invalid_records";
    };

export type HoldingsSource =
  | { kind: "related_companies"; records?: unknown }
  | { kind: "static_catalog" }
  | {
      kind: "verified";
      source: string;
      asOf?: string | null;
      holdings: unknown[];
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseObservationDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.trim().slice(0, 10);
  if (!ISO_DATE_RE.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) return null;
  return date;
}

export function parseHoldingSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const symbol = value.trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) return null;
  return symbol;
}

/** Accept an explicit percent. Never scale a fraction and never invent a missing weight. */
export function parseHoldingWeight(value: unknown): number | null {
  let numeric: number | null = null;
  if (typeof value === "number") numeric = value;
  else if (typeof value === "string") {
    const trimmed = value.trim();
    const match = PERCENT_TEXT_RE.exec(trimmed);
    if (!match) return null;
    numeric = Number(match[1]);
  }
  if (numeric === null || !Number.isFinite(numeric) || numeric <= 0 || numeric > 100) return null;
  return numeric;
}

export function isSyntheticWeightLadder(weights: number[]): boolean {
  if (weights.length < 2) return false;
  return weights.every((weight, index) => {
    const invented = SYNTHETIC_WEIGHT_ORIGIN - index * SYNTHETIC_WEIGHT_STEP;
    return Math.abs(weight - invented) < 1e-9;
  });
}

function unavailable(
  reason: "no_verified_feed" | "related_companies" | "static_catalog" | "invalid_records",
): HoldingsEvidence {
  return { status: "unavailable", reason };
}

/**
 * Resolve holdings for display.
 * `symbol` does not select a hardcoded book — SPY and an unknown ticker follow the same rules.
 */
export function presentEtfHoldings(_symbol: string, source: HoldingsSource | null): HoldingsEvidence {
  if (!source) return unavailable("no_verified_feed");
  if (source.kind === "related_companies") return unavailable("related_companies");
  if (source.kind === "static_catalog") return unavailable("static_catalog");

  const sourceName = source.source.trim();
  if (!sourceName) return unavailable("invalid_records");

  const accepted: VerifiedHolding[] = [];
  const seen = new Set<string>();
  let duplicate = false;

  for (const row of source.holdings) {
    const record = asRecord(row);
    if (!record) continue;
    const symbol = parseHoldingSymbol(record.symbol ?? record.ticker);
    const weight = parseHoldingWeight(record.weight ?? record.weightPercent);
    if (!symbol || weight === null) continue;
    if (seen.has(symbol)) {
      duplicate = true;
      break;
    }
    seen.add(symbol);
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : null;
    accepted.push({ symbol, name, weightPercent: weight });
  }

  if (duplicate || accepted.length === 0) return unavailable("invalid_records");

  const total = accepted.reduce((sum, row) => sum + row.weightPercent, 0);
  if (!Number.isFinite(total) || total > 100.5) return unavailable("invalid_records");

  return {
    status: "available",
    holdings: accepted,
    source: sourceName,
    asOf: parseObservationDate(source.asOf ?? null),
  };
}
