/**
 * Radar worker promotion and board ordering stay volume- and momentum-first.
 * Verified catalyst labels and SEC taxonomy are enriched on the Stocksist client
 * (`src/lib/catalyst/enrichment.ts`, `catalystDisplayCategoryFromEvent`).
 * Do not fetch catalyst rows inside the Fly scanner worker rank loop or use them
 * as promotion inputs.
 */
export const RADAR_CATALYST_SURFACING = "client_enrichment_only" as const;
