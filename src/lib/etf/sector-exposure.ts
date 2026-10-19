/**
 * Sector allocation evidence.
 * Exact weights are rendered only from a sourced allocation feed.
 * Holdings are never rolled up into sector percentages.
 */

import { parseHoldingWeight, parseObservationDate } from "./holdings-evidence";

export interface SectorAllocation {
  name: string;
  weightPercent: number;
}

export type SectorCoverage = "full_portfolio" | "partial";

export type SectorExposureEvidence =
  | {
      status: "available";
      sectors: SectorAllocation[];
      coverage: SectorCoverage;
      source: string;
      asOf: string | null;
    }
  | { status: "unavailable"; reason: "no_verified_feed" | "invalid_records" | "inferred_from_holdings" };

export type SectorExposureSource =
  | { kind: "holdings_inference" }
  | {
      kind: "verified";
      source: string;
      asOf?: string | null;
      allocations: unknown[];
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function unavailable(
  reason: "no_verified_feed" | "invalid_records" | "inferred_from_holdings",
): SectorExposureEvidence {
  return { status: "unavailable", reason };
}

/**
 * Full-portfolio charts require allocations that cover essentially the whole fund.
 * Anything short of that stays labeled partial and is not drawn as a complete pie.
 */
export function assessSectorCoverage(weights: number[]): SectorCoverage | null {
  if (weights.length === 0) return null;
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(total) || total <= 0 || total > 101) return null;
  if (total >= 99) return "full_portfolio";
  return "partial";
}

export function presentSectorExposure(source: SectorExposureSource | null): SectorExposureEvidence {
  if (!source) return unavailable("no_verified_feed");
  if (source.kind === "holdings_inference") return unavailable("inferred_from_holdings");

  const sourceName = source.source.trim();
  if (!sourceName) return unavailable("invalid_records");

  const sectors: SectorAllocation[] = [];
  const seen = new Set<string>();

  for (const row of source.allocations) {
    const record = asRecord(row);
    if (!record) continue;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const weight = parseHoldingWeight(record.weight ?? record.weightPercent);
    if (!name || weight === null) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) return unavailable("invalid_records");
    seen.add(key);
    sectors.push({ name, weightPercent: weight });
  }

  if (sectors.length === 0) return unavailable("invalid_records");
  const coverage = assessSectorCoverage(sectors.map((sector) => sector.weightPercent));
  if (!coverage) return unavailable("invalid_records");

  return {
    status: "available",
    sectors,
    coverage,
    source: sourceName,
    asOf: parseObservationDate(source.asOf ?? null),
  };
}
