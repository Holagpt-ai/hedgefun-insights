import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  LOCAL_PILOT_DATABASE_URL,
  openLocalPilotSql,
  resetLocalPilotTables,
} from "@/lib/persistence/local-pilot-database";
import { buildIdentityApplyPayload } from "@/lib/security-identity/identity-apply-payload";
import { SecurityIdentityStore } from "@/lib/security-identity/security-identity";
import type { SecurityIdentityObservation } from "@/types/security-identity";

const sql = openLocalPilotSql(LOCAL_PILOT_DATABASE_URL);
const RECORDED = "2026-09-21T16:00:00.000Z";

function readMigration(name: string): string {
  return readFileSync(join(process.cwd(), name), "utf8");
}

function observation(overrides: Partial<SecurityIdentityObservation> = {}): SecurityIdentityObservation {
  return {
    symbol: "INTC",
    exchange: "XNAS",
    effectiveDate: "2021-09-22",
    issuerName: "Intel",
    securityType: "COMMON_STOCK",
    compositeFigi: "BBG000C0G1D1",
    cik: "0000050863",
    source: "polygon-reference",
    provenance: "PROVIDER",
    recordedAt: RECORDED,
    ...overrides,
  };
}

async function applyDiff(
  payload: ReturnType<typeof buildIdentityApplyPayload>,
): Promise<void> {
  await sql`select public.historical_identity_apply_diff(
    ${sql.json(payload.p_securities as never)},
    ${sql.json(payload.p_history_inserts as never)},
    ${sql.json(payload.p_history_updates as never)},
    ${sql.json(payload.p_identifier_inserts as never)}
  )`;
}

async function loadStoreState(securityId?: string): Promise<{
  store: SecurityIdentityStore;
  before: {
    history: ReturnType<SecurityIdentityStore["listHistory"]>;
    identifiers: ReadonlyArray<{ securityId: string; kind: string }>;
  };
}> {
  const securities = await sql<Record<string, unknown>[]>`
    select security_id, current_symbol, issuer_name, security_type, exchange, country,
           adr_status, active, resolution_state, created_at, updated_at
    from public.securities
    ${securityId ? sql`where security_id = ${securityId}::uuid` : sql``}
  `;
  const history = await sql<Record<string, unknown>[]>`
    select security_id, symbol, exchange, effective_from, effective_to, source, source_as_of,
           provenance, observed_at, fetched_at
    from public.security_symbol_history
    ${securityId ? sql`where security_id = ${securityId}::uuid` : sql``}
  `;
  const identifiers = await sql<Record<string, unknown>[]>`
    select security_id, identifier_kind, identifier_value, source, source_as_of, provenance, observed_at, fetched_at
    from public.security_reference_identifiers
    ${securityId ? sql`where security_id = ${securityId}::uuid` : sql``}
  `;
  const store = new SecurityIdentityStore(() => crypto.randomUUID());
  store.loadState({
    securities: securities.map((row) => ({
      securityId: String(row.security_id),
      currentSymbol: String(row.current_symbol),
      issuerName: row.issuer_name == null ? null : String(row.issuer_name),
      securityType: row.security_type as "COMMON_STOCK",
      exchange: row.exchange == null ? null : String(row.exchange),
      country: row.country == null ? null : String(row.country),
      adrStatus: row.adr_status as "NOT_ADR",
      active: row.active === true,
      resolutionState: row.resolution_state as "RESOLVED",
      createdAt: RECORDED,
      updatedAt: RECORDED,
    })),
    history: history.map((row) => ({
      securityId: String(row.security_id),
      symbol: String(row.symbol),
      exchange: row.exchange == null ? null : String(row.exchange),
      effectiveFrom: String(row.effective_from).slice(0, 10),
      effectiveTo: row.effective_to == null ? null : String(row.effective_to).slice(0, 10),
      source: row.source == null ? null : String(row.source),
      sourceAsOf: row.source_as_of == null ? null : String(row.source_as_of),
      provenance: row.provenance as "PROVIDER",
      observedAt: row.observed_at == null ? null : String(row.observed_at),
      fetchedAt: row.fetched_at == null ? null : String(row.fetched_at),
    })),
    identifiers: identifiers.map((row) => ({
      securityId: String(row.security_id),
      kind: row.identifier_kind as "CIK",
      value: String(row.identifier_value),
      source: row.source == null ? null : String(row.source),
      sourceAsOf: row.source_as_of == null ? null : String(row.source_as_of),
      provenance: row.provenance as "PROVIDER",
      observedAt: row.observed_at == null ? null : String(row.observed_at),
      fetchedAt: row.fetched_at == null ? null : String(row.fetched_at),
    })),
  });
  return {
    store,
    before: {
      history: store.listHistory(),
      identifiers: store.listIdentifiers().map((row) => ({ securityId: row.securityId, kind: row.kind })),
    },
  };
}

beforeAll(async () => {
  await sql.unsafe(`
    DO $$ BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE ROLE authenticated NOLOGIN;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      CREATE ROLE anon NOLOGIN;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await sql.unsafe(readMigration("drizzle/migrations/0010_historical_backfill_supabase_rpc_v1.sql"));
  await sql.unsafe(readMigration("drizzle/migrations/0066_historical_identity_apply_diff_order_acl_v1.sql"));
});

beforeEach(async () => {
  await resetLocalPilotTables(sql);
});

afterAll(async () => {
  await sql.end();
});

describe("historical_identity_apply_diff integration", () => {
  it("closes open symbol history before opening a successor on ticker change", async () => {
    const securityId = crypto.randomUUID();
    const store = new SecurityIdentityStore(() => securityId);
    store.loadState({ securities: [], history: [], identifiers: [] });
    store.resolve(observation({ symbol: "FB", effectiveDate: "2020-01-02", compositeFigi: "BBG000FB001" }));
    await applyDiff(buildIdentityApplyPayload({ history: [], identifiers: [] }, store));

    const { store: loaded, before } = await loadStoreState(securityId);
    loaded.resolve(
      observation({
        symbol: "META",
        effectiveDate: "2022-06-09",
        compositeFigi: "BBG000FB001",
        source: "polygon-reference-events",
      }),
    );
    await applyDiff(buildIdentityApplyPayload(before, loaded));

    const rows = await sql<{ symbol: string; effective_from: string; effective_to: string | null }[]>`
      select symbol, effective_from::text, effective_to::text
      from public.security_symbol_history
      where security_id = ${securityId}
      order by effective_from
    `;
    expect(rows).toHaveLength(2);
    expect(rows[0].symbol).toBe("FB");
    expect(rows[0].effective_to).toBe("2022-06-08");
    expect(rows[1].symbol).toBe("META");
    expect(rows[1].effective_to).toBeNull();

    const openCount = await sql<{ n: string }[]>`
      select count(*)::text as n
      from public.security_symbol_history
      where security_id = ${securityId} and effective_to is null
    `;
    expect(openCount[0].n).toBe("1");

    const security = await sql<{ security_id: string; current_symbol: string }[]>`
      select security_id::text, current_symbol from public.securities where security_id = ${securityId}
    `;
    expect(security[0].security_id).toBe(securityId);
    expect(security[0].current_symbol).toBe("META");
  });

  it("rejects conflicting symbol history for the same listing key", async () => {
    const securityId = crypto.randomUUID();
    const store = new SecurityIdentityStore(() => securityId);
    store.loadState({ securities: [], history: [], identifiers: [] });
    store.resolve(observation());
    const payload = buildIdentityApplyPayload({ history: [], identifiers: [] }, store);
    await applyDiff(payload);

    const conflict = structuredClone(payload);
    conflict.p_history_inserts = conflict.p_history_inserts.map((row) => ({
      ...row,
      effective_to: "2026-01-01",
    }));
    await expect(applyDiff(conflict)).rejects.toThrow(/conflicting symbol history/);

    const history = await sql<{ n: string }[]>`
      select count(*)::text as n from public.security_symbol_history where security_id = ${securityId}
    `;
    expect(history[0].n).toBe("1");
  });

  it("does not duplicate rows when the same observation is applied twice", async () => {
    const securityId = crypto.randomUUID();
    const store = new SecurityIdentityStore(() => securityId);
    store.loadState({ securities: [], history: [], identifiers: [] });
    store.resolve(observation());
    const payload = buildIdentityApplyPayload({ history: [], identifiers: [] }, store);
    await applyDiff(payload);
    await applyDiff(payload);

    const counts = await sql<{ securities: string; history: string; identifiers: string }[]>`
      select
        (select count(*)::text from public.securities where security_id = ${securityId}) as securities,
        (select count(*)::text from public.security_symbol_history where security_id = ${securityId}) as history,
        (select count(*)::text from public.security_reference_identifiers where security_id = ${securityId}) as identifiers
    `;
    expect(counts[0].securities).toBe("1");
    expect(counts[0].history).toBe("1");
    expect(Number(counts[0].identifiers)).toBeGreaterThan(0);
  });

  it("rolls back atomically when identifier inserts are invalid", async () => {
    const securityId = crypto.randomUUID();
    const store = new SecurityIdentityStore(() => securityId);
    store.loadState({ securities: [], history: [], identifiers: [] });
    store.resolve(observation({ symbol: "AAA" }));
    const valid = buildIdentityApplyPayload({ history: [], identifiers: [] }, store);
    await applyDiff(valid);

    const { store: loaded, before } = await loadStoreState(securityId);
    loaded.resolve(
      observation({
        symbol: "AAB",
        effectiveDate: "2024-01-02",
        compositeFigi: "BBG000C0G1D1",
      }),
    );
    const bad = buildIdentityApplyPayload(before, loaded);
    bad.p_identifier_inserts.push({
      security_id: securityId,
      identifier_kind: "FIGI",
      identifier_value: "BBG000FAIL001",
      source: "x",
      source_as_of: null,
      provenance: "NOT_A_VALID_PROVENANCE",
      observed_at: null,
      fetched_at: null,
    });

    await expect(applyDiff(bad)).rejects.toThrow();

    const symbol = await sql<{ current_symbol: string }[]>`
      select current_symbol from public.securities where security_id = ${securityId}
    `;
    expect(symbol[0].current_symbol).toBe("AAA");
    const history = await sql<{ n: string }[]>`
      select count(*)::text as n from public.security_symbol_history where security_id = ${securityId}
    `;
    expect(history[0].n).toBe("1");
  });

  it("leaves another security's symbol history untouched", async () => {
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    for (const [id, symbol] of [[firstId, "ONE"], [secondId, "TWO"]] as const) {
      const store = new SecurityIdentityStore(() => id);
      store.loadState({ securities: [], history: [], identifiers: [] });
      store.resolve(
        observation({
          symbol,
          effectiveDate: "2020-01-02",
          compositeFigi: symbol === "ONE" ? "BBG000ONE001" : "BBG000TWO002",
        }),
      );
      await applyDiff(buildIdentityApplyPayload({ history: [], identifiers: [] }, store));
    }

    const snapshot = await sql<{ security_id: string; symbol: string; effective_to: string | null }[]>`
      select security_id::text, symbol, effective_to::text
      from public.security_symbol_history
      where security_id = ${secondId}
    `;

    const { store: loaded, before } = await loadStoreState(firstId);
    loaded.resolve(
      observation({
        symbol: "UNO",
        effectiveDate: "2023-01-03",
        compositeFigi: "BBG000ONE001",
      }),
    );
    await applyDiff(buildIdentityApplyPayload(before, loaded));

    const untouched = await sql<{ security_id: string; symbol: string; effective_to: string | null }[]>`
      select security_id::text, symbol, effective_to::text
      from public.security_symbol_history
      where security_id = ${secondId}
    `;
    expect(untouched).toEqual(snapshot);
  });

  it("restricts EXECUTE to service_role and blocks anon/authenticated", async () => {
    const grants = await sql<{ grantee: string; privilege_type: string }[]>`
      select grantee, privilege_type
      from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name = 'historical_identity_apply_diff'
        and privilege_type = 'EXECUTE'
      order by grantee
    `;
    const grantees = grants.map((row) => row.grantee);
    expect(grantees).toContain("service_role");
    expect(grantees).not.toContain("anon");
    expect(grantees).not.toContain("authenticated");
    expect(grantees).not.toContain("PUBLIC");

    const emptyPayload = {
      p_securities: [],
      p_history_inserts: [],
      p_history_updates: [],
      p_identifier_inserts: [],
    };
    await expect(
      sql.unsafe(`
        set local role authenticated;
        select public.historical_identity_apply_diff('[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb);
      `),
    ).rejects.toThrow(/permission denied/i);
  });
});
