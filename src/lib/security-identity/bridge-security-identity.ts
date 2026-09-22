import { buildIdentityApplyPayload } from "@/lib/security-identity/identity-apply-payload";
import { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type { HistoricalBridgeClient } from "@/lib/persistence/historical-bridge-client";
import type {
  IdentityResolution,
  Security,
  SecurityId,
  SecurityIdentityObservation,
  SecurityReferenceIdentifier,
  SecuritySymbolHistory,
  SymbolAtDate,
} from "@/types/security-identity";

function text(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function iso(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapSecurity(row: Record<string, unknown>): Security {
  return {
    securityId: String(row.security_id),
    currentSymbol: String(row.current_symbol),
    issuerName: text(row.issuer_name),
    securityType: row.security_type as Security["securityType"],
    exchange: text(row.exchange),
    country: text(row.country),
    adrStatus: row.adr_status as Security["adrStatus"],
    active: row.active === true,
    resolutionState: row.resolution_state as Security["resolutionState"],
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? "",
  };
}

function mapHistory(row: Record<string, unknown>): SecuritySymbolHistory {
  return {
    securityId: String(row.security_id),
    symbol: String(row.symbol),
    exchange: text(row.exchange),
    effectiveFrom: String(row.effective_from).slice(0, 10),
    effectiveTo: row.effective_to == null ? null : String(row.effective_to).slice(0, 10),
    source: text(row.source),
    sourceAsOf: iso(row.source_as_of),
    provenance: row.provenance as SecuritySymbolHistory["provenance"],
    observedAt: iso(row.observed_at),
    fetchedAt: iso(row.fetched_at),
  };
}

function mapIdentifier(row: Record<string, unknown>): SecurityReferenceIdentifier {
  return {
    securityId: String(row.security_id),
    kind: row.identifier_kind as SecurityReferenceIdentifier["kind"],
    value: String(row.identifier_value),
    source: text(row.source),
    sourceAsOf: iso(row.source_as_of),
    provenance: row.provenance as SecurityReferenceIdentifier["provenance"],
    observedAt: iso(row.observed_at),
    fetchedAt: iso(row.fetched_at),
  };
}

export class BridgeSecurityIdentityRepository {
  constructor(
    private readonly bridge: HistoricalBridgeClient,
    private readonly createId: () => SecurityId = () => crypto.randomUUID(),
  ) {}

  private async loadAll() {
    const securities = (await this.bridge.fetchAllRows("historical_list_securities", {})).map(mapSecurity);
    const history = (await this.bridge.fetchAllRows("historical_list_symbol_history", {})).map(mapHistory);
    const identifiers = (await this.bridge.fetchAllRows("historical_list_reference_identifiers", {})).map(mapIdentifier);
    return { securities, history, identifiers };
  }

  async resolve(observation: SecurityIdentityObservation): Promise<IdentityResolution> {
    const before = await this.loadAll();
    const store = new SecurityIdentityStore(this.createId);
    store.loadState(before);
    const result = store.resolve(observation);
    if (!result.securityId) return result;
    const payload = buildIdentityApplyPayload(before, store);
    await this.bridge.call("historical_identity_apply_diff", payload);
    return result;
  }

  async listHistory(securityId?: SecurityId): Promise<readonly SecuritySymbolHistory[]> {
    const rows = await this.bridge.fetchAllRows(
      "historical_list_symbol_history",
      securityId === undefined ? {} : { security_id: securityId },
    );
    return rows.map(mapHistory);
  }

  async symbolAt(securityId: SecurityId, eventDate: string): Promise<SymbolAtDate | null> {
    const res = await this.bridge.call("historical_symbol_at", {
      security_id: securityId,
      event_date: eventDate,
    });
    const row = res.symbol;
    if (!row || typeof row !== "object") return null;
    const record = row as Record<string, unknown>;
    return {
      securityId,
      symbol: String(record.symbol),
      exchange: text(record.exchange),
      effectiveFrom: String(record.effective_from).slice(0, 10),
      effectiveTo: record.effective_to == null ? null : String(record.effective_to).slice(0, 10),
    };
  }

  async getSecurity(securityId: SecurityId): Promise<Security | null> {
    const rows = await this.bridge.fetchAllRows("historical_list_securities", {});
    return rows.map(mapSecurity).find((row) => row.securityId === securityId) ?? null;
  }

  async listIdentifiers(securityId?: SecurityId): Promise<readonly SecurityReferenceIdentifier[]> {
    const rows = await this.bridge.fetchAllRows(
      "historical_list_reference_identifiers",
      securityId === undefined ? {} : { security_id: securityId },
    );
    return rows.map(mapIdentifier);
  }
}
