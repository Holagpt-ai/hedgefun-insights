import type { RadarRankedRow } from "./types";

/** Verified row company name for issuer-scoped news — no symbol fallback. */
export function radarRowCompanyName(row: Pick<RadarRankedRow, "company_name">): string | null {
  const name = row.company_name?.trim();
  return name ? name : null;
}
