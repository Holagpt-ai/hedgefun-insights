import type { Sql, TransactionSql } from "postgres";
import { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type {
  IdentityResolution,
  Security,
  SecurityId,
  SecurityIdentityObservation,
  SecurityReferenceIdentifier,
  SecuritySymbolHistory,
  SymbolAtDate,
} from "@/types/security-identity";

type Db = Sql | TransactionSql;

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

async function loadAll(db: Db) {
  const securities = await db<Record<string, unknown>[]>`
    select security_id, current_symbol, issuer_name, security_type, exchange, country,
           adr_status, active, resolution_state, created_at, updated_at
    from public.securities
  `;
  const history = await db<Record<string, unknown>[]>`
    select security_id, symbol, exchange, effective_from::text, effective_to::text,
           source, source_as_of, provenance, observed_at, fetched_at
    from public.security_symbol_history
  `;
  const identifiers = await db<Record<string, unknown>[]>`
    select security_id, identifier_kind, identifier_value, source, source_as_of, provenance, observed_at, fetched_at
    from public.security_reference_identifiers
  `;
  return {
    securities: securities.map(mapSecurity),
    history: history.map(mapHistory),
    identifiers: identifiers.map(mapIdentifier),
  };
}

function historyKey(row: SecuritySymbolHistory): string {
  return `${row.securityId}|${row.symbol}|${row.exchange ?? ""}|${row.effectiveFrom}`;
}

async function saveDiff(
  db: Db,
  before: Awaited<ReturnType<typeof loadAll>>,
  afterStore: SecurityIdentityStore,
): Promise<void> {
  const beforeHistory = new Map(before.history.map((row) => [historyKey(row), row]));
  for (const security of afterStore.listSecurities()) {
    await db`
      insert into public.securities (
        security_id, current_symbol, issuer_name, security_type, exchange, country,
        adr_status, active, resolution_state, created_at, updated_at
      ) values (
        ${security.securityId}, ${security.currentSymbol}, ${security.issuerName}, ${security.securityType},
        ${security.exchange}, ${security.country}, ${security.adrStatus}, ${security.active},
        ${security.resolutionState}, ${security.createdAt}, ${security.updatedAt}
      )
      on conflict (security_id) do update set
        current_symbol = excluded.current_symbol,
        issuer_name = excluded.issuer_name,
        security_type = excluded.security_type,
        exchange = excluded.exchange,
        country = excluded.country,
        adr_status = excluded.adr_status,
        active = excluded.active,
        resolution_state = excluded.resolution_state,
        updated_at = excluded.updated_at
    `;
  }
  for (const row of afterStore.listHistory()) {
    const prior = beforeHistory.get(historyKey(row));
    if (!prior) {
      await db`
        insert into public.security_symbol_history (
          history_id, security_id, symbol, exchange, effective_from, effective_to,
          source, source_as_of, provenance, observed_at, fetched_at
        ) values (
          ${crypto.randomUUID()}, ${row.securityId}, ${row.symbol}, ${row.exchange},
          ${row.effectiveFrom}, ${row.effectiveTo}, ${row.source}, ${row.sourceAsOf},
          ${row.provenance}, ${row.observedAt}, ${row.fetchedAt}
        )
      `;
      continue;
    }
    if (prior.effectiveTo !== row.effectiveTo) {
      await db`
        update public.security_symbol_history
        set effective_to = ${row.effectiveTo}
        where security_id = ${row.securityId}
          and symbol = ${row.symbol}
          and coalesce(exchange, '') = ${row.exchange ?? ""}
          and effective_from = ${row.effectiveFrom}
      `;
    }
  }
  const beforeIds = new Set(before.identifiers.map((row) => `${row.securityId}|${row.kind}`));
  for (const row of afterStore.listIdentifiers()) {
    if (beforeIds.has(`${row.securityId}|${row.kind}`)) continue;
    await db`
      insert into public.security_reference_identifiers (
        security_id, identifier_kind, identifier_value, source, source_as_of, provenance, observed_at, fetched_at
      ) values (
        ${row.securityId}, ${row.kind}, ${row.value}, ${row.source}, ${row.sourceAsOf},
        ${row.provenance}, ${row.observedAt}, ${row.fetchedAt}
      )
      on conflict (security_id, identifier_kind) do nothing
    `;
  }
}

/**
 * PostgreSQL adapter for the existing identity resolver.
 * Resolution rules stay in SecurityIdentityStore. This class only loads and saves rows.
 */
export class PostgresSecurityIdentityRepository {
  constructor(
    private readonly sql: Sql,
    private readonly createId: () => SecurityId = () => crypto.randomUUID(),
  ) {}

  async resolve(observation: SecurityIdentityObservation): Promise<IdentityResolution> {
    return this.sql.begin(async (tx) => {
      const before = await loadAll(tx);
      const store = new SecurityIdentityStore(this.createId);
      store.loadState(before);
      const result = store.resolve(observation);
      if (result.securityId) await saveDiff(tx, before, store);
      return result;
    });
  }

  async listHistory(securityId?: SecurityId): Promise<readonly SecuritySymbolHistory[]> {
    const rows = securityId === undefined
      ? await this.sql<Record<string, unknown>[]>`
          select security_id, symbol, exchange, effective_from::text, effective_to::text,
                 source, source_as_of, provenance, observed_at, fetched_at
          from public.security_symbol_history
        `
      : await this.sql<Record<string, unknown>[]>`
          select security_id, symbol, exchange, effective_from::text, effective_to::text,
                 source, source_as_of, provenance, observed_at, fetched_at
          from public.security_symbol_history
          where security_id = ${securityId}
        `;
    return rows.map(mapHistory);
  }

  async symbolAt(securityId: SecurityId, eventDate: string): Promise<SymbolAtDate | null> {
    const rows = await this.sql<Record<string, unknown>[]>`
      select security_id, symbol, exchange, effective_from::text, effective_to::text
      from public.security_symbol_history
      where security_id = ${securityId}
        and effective_from <= ${eventDate}
        and (effective_to is null or effective_to >= ${eventDate})
    `;
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
    const rows = await this.sql<Record<string, unknown>[]>`
      select security_id, current_symbol, issuer_name, security_type, exchange, country,
             adr_status, active, resolution_state, created_at, updated_at
      from public.securities
      where security_id = ${securityId}
    `;
    return rows[0] ? mapSecurity(rows[0]) : null;
  }

  async listIdentifiers(securityId?: SecurityId): Promise<readonly SecurityReferenceIdentifier[]> {
    const rows = securityId === undefined
      ? await this.sql<Record<string, unknown>[]>`
          select security_id, identifier_kind, identifier_value, source, source_as_of, provenance, observed_at, fetched_at
          from public.security_reference_identifiers
        `
      : await this.sql<Record<string, unknown>[]>`
          select security_id, identifier_kind, identifier_value, source, source_as_of, provenance, observed_at, fetched_at
          from public.security_reference_identifiers
          where security_id = ${securityId}
        `;
    return rows.map(mapIdentifier);
  }
}
