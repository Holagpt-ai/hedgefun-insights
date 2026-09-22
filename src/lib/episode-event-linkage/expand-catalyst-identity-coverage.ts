import type { EligibleTickerRow } from "@/lib/episode-event-linkage/analyze-catalyst-unresolved";
import { buildEligibleTickerIndex } from "@/lib/episode-event-linkage/analyze-catalyst-unresolved";
import { buildIdentityApplyPayload } from "@/lib/security-identity/identity-apply-payload";
import { loadSecurityIdentitySnapshotFromBridge } from "@/lib/episode-event-linkage/load-bridge-identity-store";
import { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type { HistoricalBridgeClient } from "@/lib/persistence/historical-bridge-client";
import type { SecurityIdentityObservation } from "@/types/security-identity";

export interface CatalystIdentityExpansionCandidate {
  symbol: string;
  exchange: string | null;
  issuerName: string | null;
  effectiveDate: string;
  catalystRowCount: number;
}

export function selectCatalystIdentityExpansionCandidates(input: {
  unresolvedSymbols: readonly {
    symbol: string;
    classification: string;
    earliestEventDate: string | null;
    rowCount: number;
  }[];
  eligibleTickers: readonly EligibleTickerRow[];
  maxCandidates?: number;
}): CatalystIdentityExpansionCandidate[] {
  const { bySymbol } = buildEligibleTickerIndex(input.eligibleTickers);
  const max = input.maxCandidates ?? 5_000;
  const candidates: CatalystIdentityExpansionCandidate[] = [];

  for (const row of input.unresolvedSymbols) {
    if (candidates.length >= max) break;
    if (row.classification !== "no_identity_match") continue;
    const eligible = bySymbol.get(row.symbol.trim().toUpperCase());
    if (!eligible || eligible.length !== 1) continue;
    const ticker = eligible[0]!;
    const effectiveDate = row.earliestEventDate ?? "2026-01-02";
    candidates.push({
      symbol: ticker.symbol.trim().toUpperCase(),
      exchange: ticker.exchange?.trim().toUpperCase() ?? null,
      issuerName: ticker.name?.trim() || null,
      effectiveDate,
      catalystRowCount: row.rowCount,
    });
  }

  candidates.sort((a, b) => b.catalystRowCount - a.catalystRowCount);
  return candidates;
}

function observationForCandidate(
  candidate: CatalystIdentityExpansionCandidate,
  recordedAt: string,
): SecurityIdentityObservation {
  return {
    symbol: candidate.symbol,
    exchange: candidate.exchange,
    effectiveDate: candidate.effectiveDate,
    issuerName: candidate.issuerName,
    securityType: "COMMON_STOCK",
    country: "US",
    adrStatus: "NOT_ADR",
    provenance: "PROVIDER",
    source: "catalyst_identity_coverage_v1",
    sourceAsOf: recordedAt,
    observedAt: recordedAt,
    fetchedAt: recordedAt,
    recordedAt,
  };
}

export async function applyCatalystIdentityExpansion(input: {
  bridge: HistoricalBridgeClient;
  candidates: readonly CatalystIdentityExpansionCandidate[];
  recordedAt: string;
}): Promise<{
  attempted: number;
  created: number;
  matched: number;
  rejected: number;
  rejectReasons: Record<string, number>;
}> {
  const before = await loadSecurityIdentitySnapshotFromBridge(input.bridge);
  const store = new SecurityIdentityStore();
  store.loadState(before);

  let created = 0;
  let matched = 0;
  let rejected = 0;
  const rejectReasons: Record<string, number> = {};
  const seenSymbols = new Set<string>();

  for (const candidate of input.candidates) {
    if (seenSymbols.has(candidate.symbol)) continue;
    seenSymbols.add(candidate.symbol);
    const result = store.resolve(observationForCandidate(candidate, input.recordedAt));
    if (!result.securityId) {
      rejected += 1;
      const reason = result.reason ?? "unresolved";
      rejectReasons[reason] = (rejectReasons[reason] ?? 0) + 1;
      continue;
    }
    if (result.created) created += 1;
    else matched += 1;
  }

  const payload = buildIdentityApplyPayload(before, store);
  if (
    payload.p_securities.length > before.securities.length
    || payload.p_history_inserts.length > 0
    || payload.p_history_updates.length > 0
    || payload.p_identifier_inserts.length > 0
  ) {
    await input.bridge.call("historical_identity_apply_diff", payload);
  }

  return {
    attempted: seenSymbols.size,
    created,
    matched,
    rejected,
    rejectReasons,
  };
}
