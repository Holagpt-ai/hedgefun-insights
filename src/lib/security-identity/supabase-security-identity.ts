import type { SupabaseClient } from "@supabase/supabase-js";
import { buildIdentityApplyPayload } from "@/lib/security-identity/identity-apply-payload";
import { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import { selectAllPages } from "@/lib/persistence/supabase-server";
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

export class SupabaseSecurityIdentityRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly createId: () => SecurityId = () => crypto.randomUUID(),
  ) {}

  private async loadAll() {
    const securities = await selectAllPages<Record<string, unknown>>((from, to) =>
      this.supabase.from("securities").select("*").range(from, to),
    );
    const history = await selectAllPages<Record<string, unknown>>((from, to) =>
      this.supabase.from("security_symbol_history").select("*").range(from, to),
    );
    const identifiers = await selectAllPages<Record<string, unknown>>((from, to) =>
      this.supabase.from("security_reference_identifiers").select("*").range(from, to),
    );
    return {
      securities: securities.map(mapSecurity),
      history: history.map(mapHistory),
      identifiers: identifiers.map(mapIdentifier),
    };
  }

  async resolve(observation: SecurityIdentityObservation): Promise<IdentityResolution> {
    const before = await this.loadAll();
    const store = new SecurityIdentityStore(this.createId);
    store.loadState(before);
    const result = store.resolve(observation);
    if (!result.securityId) return result;
    const payload = buildIdentityApplyPayload(before, store);
    const { error } = await this.supabase.rpc("historical_identity_apply_diff", payload);
    if (error) throw new Error(error.message);
    return result;
  }

  async listHistory(securityId?: SecurityId): Promise<readonly SecuritySymbolHistory[]> {
    const rows = securityId === undefined
      ? await selectAllPages<Record<string, unknown>>((from, to) =>
        this.supabase.from("security_symbol_history").select("*").range(from, to),
      )
      : await selectAllPages<Record<string, unknown>>((from, to) =>
        this.supabase.from("security_symbol_history").select("*").eq("security_id", securityId).range(from, to),
      );
    return rows.map(mapHistory);
  }

  async symbolAt(securityId: SecurityId, eventDate: string): Promise<SymbolAtDate | null> {
    const { data, error } = await this.supabase
      .from("security_symbol_history")
      .select("security_id, symbol, exchange, effective_from, effective_to")
      .eq("security_id", securityId)
      .lte("effective_from", eventDate)
      .or(`effective_to.is.null,effective_to.gte.${eventDate}`);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length !== 1) return null;
    const row = rows[0];
    return {
      securityId,
      symbol: String(row.symbol),
      exchange: text(row.exchange),
      effectiveFrom: String(row.effective_from).slice(0, 10),
      effectiveTo: row.effective_to == null ? null : String(row.effective_to).slice(0, 10),
    };
  }

  async getSecurity(securityId: SecurityId): Promise<Security | null> {
    const { data, error } = await this.supabase.from("securities").select("*").eq("security_id", securityId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapSecurity(data as Record<string, unknown>) : null;
  }

  async listIdentifiers(securityId?: SecurityId): Promise<readonly SecurityReferenceIdentifier[]> {
    const rows = securityId === undefined
      ? await selectAllPages<Record<string, unknown>>((from, to) =>
        this.supabase.from("security_reference_identifiers").select("*").range(from, to),
      )
      : await selectAllPages<Record<string, unknown>>((from, to) =>
        this.supabase.from("security_reference_identifiers").select("*").eq("security_id", securityId).range(from, to),
      );
    return rows.map(mapIdentifier);
  }
}
