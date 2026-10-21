import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import { buildCatalystEvidenceGraph } from "@/lib/catalyst/catalyst-evidence-graph";
import { passesDirectCatalystVerificationGuard } from "@/lib/catalyst/catalyst-verification-guards";
import type { CatalystAvailability } from "@/lib/catalyst/intelligence-v2";
import { hydrateCatalystEventVerification } from "@/lib/catalyst/catalyst-event-verification";
import type { CatalystEvidenceGraph } from "@/lib/catalyst/catalyst-evidence-graph";

export interface SymbolCatalystPlatformContext {
  symbol: string;
  availability: CatalystAvailability;
  enrichment: CatalystEnrichmentEntry | null;
  graph: CatalystEvidenceGraph | null;
  catalystPath: string | null;
}

export function resolveSymbolCatalystAvailability(input: {
  queryError: boolean;
  entry: CatalystEnrichmentEntry | null | undefined;
  nowMs: number;
}): CatalystAvailability {
  if (input.queryError) return "unavailable";
  if (!input.entry) return "none";
  const event = hydrateCatalystEventVerification(input.entry.event);
  if (!passesDirectCatalystVerificationGuard(event, input.nowMs)) return "none";
  return "verified";
}

export function buildSymbolCatalystPlatformContext(input: {
  symbol: string;
  entry: CatalystEnrichmentEntry | null | undefined;
  availability: CatalystAvailability;
  nowMs: number;
}): SymbolCatalystPlatformContext {
  const symbol = input.symbol.trim().toUpperCase();
  const enriched = input.entry
    ? { ...input.entry, event: hydrateCatalystEventVerification(input.entry.event) }
    : null;
  const verified = input.availability === "verified" && enriched
    && passesDirectCatalystVerificationGuard(enriched.event, input.nowMs);
  return {
    symbol,
    availability: verified ? "verified" : input.availability === "unavailable" ? "unavailable" : "none",
    enrichment: verified ? enriched : input.availability === "verified" ? null : enriched,
    graph: verified && enriched ? buildCatalystEvidenceGraph(enriched.event) : null,
    catalystPath: symbol ? `/dashboard/catalyst?symbol=${encodeURIComponent(symbol)}` : null,
  };
}
