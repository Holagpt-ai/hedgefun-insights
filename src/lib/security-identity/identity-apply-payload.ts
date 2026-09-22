import type { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type { SecuritySymbolHistory } from "@/types/security-identity";

function historyKey(row: SecuritySymbolHistory): string {
  return `${row.securityId}|${row.symbol}|${row.exchange ?? ""}|${row.effectiveFrom}`;
}

function iso(value: string | null): string | null {
  return value;
}

export function buildIdentityApplyPayload(
  before: {
    history: readonly SecuritySymbolHistory[];
    identifiers: ReadonlyArray<{ securityId: string; kind: string }>;
  },
  store: SecurityIdentityStore,
): {
  p_securities: Record<string, unknown>[];
  p_history_inserts: Record<string, unknown>[];
  p_history_updates: Record<string, unknown>[];
  p_identifier_inserts: Record<string, unknown>[];
} {
  const beforeHistory = new Map(before.history.map((row) => [historyKey(row), row]));
  const beforeIds = new Set(before.identifiers.map((row) => `${row.securityId}|${row.kind}`));
  const p_securities = store.listSecurities().map((security) => ({
    security_id: security.securityId,
    current_symbol: security.currentSymbol,
    issuer_name: security.issuerName,
    security_type: security.securityType,
    exchange: security.exchange,
    country: security.country,
    adr_status: security.adrStatus,
    active: security.active,
    resolution_state: security.resolutionState,
    created_at: iso(security.createdAt),
    updated_at: iso(security.updatedAt),
  }));
  const p_history_inserts: Record<string, unknown>[] = [];
  const p_history_updates: Record<string, unknown>[] = [];
  for (const row of store.listHistory()) {
    const prior = beforeHistory.get(historyKey(row));
    if (!prior) {
      p_history_inserts.push({
        security_id: row.securityId,
        symbol: row.symbol,
        exchange: row.exchange,
        effective_from: row.effectiveFrom,
        effective_to: row.effectiveTo,
        source: row.source,
        source_as_of: iso(row.sourceAsOf),
        provenance: row.provenance,
        observed_at: iso(row.observedAt),
        fetched_at: iso(row.fetchedAt),
      });
      continue;
    }
    if (prior.effectiveTo !== row.effectiveTo) {
      p_history_updates.push({
        security_id: row.securityId,
        symbol: row.symbol,
        exchange: row.exchange ?? "",
        effective_from: row.effectiveFrom,
        effective_to: row.effectiveTo,
      });
    }
  }
  const p_identifier_inserts = store.listIdentifiers()
    .filter((row) => !beforeIds.has(`${row.securityId}|${row.kind}`))
    .map((row) => ({
      security_id: row.securityId,
      identifier_kind: row.kind,
      identifier_value: row.value,
      source: row.source,
      source_as_of: iso(row.sourceAsOf),
      provenance: row.provenance,
      observed_at: iso(row.observedAt),
      fetched_at: iso(row.fetchedAt),
    }));
  return { p_securities, p_history_inserts, p_history_updates, p_identifier_inserts };
}
