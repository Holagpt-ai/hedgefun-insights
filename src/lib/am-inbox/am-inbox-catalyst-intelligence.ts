import type { SymbolCatalystPlatformContext } from "@/lib/catalyst/catalyst-platform-context";
/** AM morning board catalyst intel — aligned with cross-platform CatalystAvailability + load state. */
export type MorningCatalystIntelStatus = "verified" | "none" | "unavailable" | "pending";

export function resolveMorningCatalystIntelStatus(input: {
  platform?: SymbolCatalystPlatformContext | null;
  catalystIntelPending?: boolean;
  catalystIntelError?: boolean;
  /** Legacy pre-market watch list hint (unverified until platform map resolves). */
  legacySymbolHint?: boolean;
  legacyExplicit?: boolean | null;
}): MorningCatalystIntelStatus {
  if (input.catalystIntelError) return "unavailable";
  const availability = input.platform?.availability;
  if (availability === "verified") return "verified";
  if (availability === "unavailable") return "unavailable";
  if (availability === "none") return "none";
  if (input.catalystIntelPending) return "pending";
  if (input.legacyExplicit === false) return "none";
  if (input.legacyExplicit === true || input.legacySymbolHint) return "pending";
  return "none";
}

export function collectMorningBoardEnrichmentSymbols(input: {
  radarSymbols?: readonly string[];
  continuationSymbols?: readonly string[];
  catalystWatchSymbols?: readonly string[];
}): string[] {
  const set = new Set<string>();
  for (const list of [
    input.radarSymbols,
    input.continuationSymbols,
    input.catalystWatchSymbols,
  ]) {
    for (const raw of list ?? []) {
      const sym = raw.trim().toUpperCase();
      if (sym) set.add(sym);
    }
  }
  return [...set];
}
