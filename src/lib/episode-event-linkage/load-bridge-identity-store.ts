import { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type { HistoricalBridgeClient } from "@/lib/persistence/historical-bridge-client";
import type { Security, SecurityReferenceIdentifier, SecuritySymbolHistory } from "@/types/security-identity";

function mapSecurity(row: Record<string, unknown>): Security {
  return {
    securityId: String(row.security_id),
    currentSymbol: String(row.current_symbol),
    issuerName: typeof row.issuer_name === "string" ? row.issuer_name : null,
    securityType: row.security_type as Security["securityType"],
    exchange: typeof row.exchange === "string" ? row.exchange : null,
    country: typeof row.country === "string" ? row.country : null,
    adrStatus: row.adr_status as Security["adrStatus"],
    active: row.active === true,
    resolutionState: row.resolution_state as Security["resolutionState"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapHistory(row: Record<string, unknown>): SecuritySymbolHistory {
  return {
    securityId: String(row.security_id),
    symbol: String(row.symbol),
    exchange: typeof row.exchange === "string" ? row.exchange : null,
    effectiveFrom: String(row.effective_from).slice(0, 10),
    effectiveTo: row.effective_to == null ? null : String(row.effective_to).slice(0, 10),
    source: typeof row.source === "string" ? row.source : null,
    sourceAsOf: typeof row.source_as_of === "string" ? row.source_as_of : null,
    provenance: row.provenance as SecuritySymbolHistory["provenance"],
    observedAt: typeof row.observed_at === "string" ? row.observed_at : null,
    fetchedAt: typeof row.fetched_at === "string" ? row.fetched_at : null,
  };
}

function mapIdentifier(row: Record<string, unknown>): SecurityReferenceIdentifier {
  return {
    securityId: String(row.security_id),
    kind: row.identifier_kind as SecurityReferenceIdentifier["kind"],
    value: String(row.identifier_value),
    source: typeof row.source === "string" ? row.source : null,
    sourceAsOf: typeof row.source_as_of === "string" ? row.source_as_of : null,
    provenance: row.provenance as SecurityReferenceIdentifier["provenance"],
    observedAt: typeof row.observed_at === "string" ? row.observed_at : null,
    fetchedAt: typeof row.fetched_at === "string" ? row.fetched_at : null,
  };
}

export async function loadSecurityIdentityStoreFromBridge(
  bridge: HistoricalBridgeClient,
): Promise<SecurityIdentityStore> {
  const [securities, history, identifiers] = await Promise.all([
    bridge.fetchAllRows("historical_list_securities", {}),
    bridge.fetchAllRows("historical_list_symbol_history", {}),
    bridge.fetchAllRows("historical_list_reference_identifiers", {}),
  ]);
  const store = new SecurityIdentityStore();
  store.loadState({
    securities: securities.map(mapSecurity),
    history: history.map(mapHistory),
    identifiers: identifiers.map(mapIdentifier),
  });
  return store;
}

export async function fetchAllCatalystEvents(
  bridge: HistoricalBridgeClient,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 500;
  for (;;) {
    const res = await bridge.call("catalyst_event_list", { page_offset: offset, page_limit: limit });
    const batch = Array.isArray(res.result) ? res.result as Record<string, unknown>[] : [];
    if (batch.length === 0) break;
    rows.push(...batch);
    offset += batch.length;
    if (batch.length < limit) break;
  }
  return rows;
}
