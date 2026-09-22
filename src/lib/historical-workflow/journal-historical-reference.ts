import type { HistoricalWorkflowContext } from "@/lib/historical-workflow/historical-workflow-types";

export const JOURNAL_OBSERVATIONAL_HISTORICAL_PREFIX = "stocksist-journal-historical-ref:";

/** Observational only — never written into trade P&L or performance fields. */
export interface JournalObservationalHistoricalReference {
  capturedAt: string;
  symbol: string;
  securityId: string | null;
  historicalContextAvailable: boolean;
  evidenceLabels: readonly string[];
  sampleSizeQuality: string | null;
  comparableEpisodeCount: number;
  mostRecentComparableDate: string | null;
  profileFreshness: string;
}

export function journalReferenceFromWorkflow(
  workflow: HistoricalWorkflowContext,
): JournalObservationalHistoricalReference {
  return {
    capturedAt: new Date().toISOString(),
    symbol: workflow.symbol,
    securityId: workflow.securityId,
    historicalContextAvailable: workflow.historicalContextAvailable,
    evidenceLabels: workflow.evidenceLabels,
    sampleSizeQuality: workflow.sampleSizeQuality,
    comparableEpisodeCount: workflow.comparableEpisodeCount,
    mostRecentComparableDate: workflow.mostRecentComparableDate,
    profileFreshness: workflow.profileFreshness,
  };
}

export function persistJournalObservationalHistoricalReference(
  ref: JournalObservationalHistoricalReference,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(
      `${JOURNAL_OBSERVATIONAL_HISTORICAL_PREFIX}${ref.symbol.trim().toUpperCase()}`,
      JSON.stringify(ref),
    );
  } catch {
    // ignore
  }
}

export function readJournalObservationalHistoricalReference(
  symbol: string,
): JournalObservationalHistoricalReference | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`${JOURNAL_OBSERVATIONAL_HISTORICAL_PREFIX}${symbol.trim().toUpperCase()}`);
    if (!raw) return null;
    return JSON.parse(raw) as JournalObservationalHistoricalReference;
  } catch {
    return null;
  }
}
