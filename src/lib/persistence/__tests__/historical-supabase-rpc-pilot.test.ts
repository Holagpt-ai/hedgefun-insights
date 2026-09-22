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

beforeAll(async () => {
  await sql.unsafe(`
    DO $$ BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);
  const migration = readFileSync(
    join(process.cwd(), "drizzle/migrations/0010_historical_backfill_supabase_rpc_v1.sql"),
    "utf8",
  );
  await sql.unsafe(migration);
});

beforeEach(async () => {
  await resetLocalPilotTables(sql);
});

afterAll(async () => {
  await sql.end();
});

describe("historical supabase RPC persistence", () => {
  it("reuses the same security_id through historical_identity_apply_diff", async () => {
    const store = new SecurityIdentityStore(() => crypto.randomUUID());
    store.loadState({ securities: [], history: [], identifiers: [] });
    const first = store.resolve(observation());
    expect(first.securityId).toBeTruthy();
    const payload = buildIdentityApplyPayload({ history: [], identifiers: [] }, store);
    await sql`select public.historical_identity_apply_diff(
      ${sql.json(payload.p_securities as never)},
      ${sql.json(payload.p_history_inserts as never)},
      ${sql.json(payload.p_history_updates as never)},
      ${sql.json(payload.p_identifier_inserts as never)}
    )`;
    const againStore = new SecurityIdentityStore(() => crypto.randomUUID());
    const securities = await sql<Record<string, unknown>[]>`
      select security_id, current_symbol, issuer_name, security_type, exchange, country,
             adr_status, active, resolution_state, created_at, updated_at
      from public.securities
    `;
    const history = await sql<Record<string, unknown>[]>`
      select security_id, symbol, exchange, effective_from, effective_to, source, source_as_of,
             provenance, observed_at, fetched_at
      from public.security_symbol_history
    `;
    const identifiers = await sql<Record<string, unknown>[]>`
      select security_id, identifier_kind, identifier_value, source, source_as_of, provenance, observed_at, fetched_at
      from public.security_reference_identifiers
    `;
    againStore.loadState({
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
    const beforeSecond = {
      history: againStore.listHistory(),
      identifiers: againStore.listIdentifiers().map((row) => ({ securityId: row.securityId, kind: row.kind })),
    };
    const second = againStore.resolve(observation({ issuerName: "Intel Corporation" }));
    const payload2 = buildIdentityApplyPayload(beforeSecond, againStore);
    await sql`select public.historical_identity_apply_diff(
      ${sql.json(payload2.p_securities as never)},
      ${sql.json(payload2.p_history_inserts as never)},
      ${sql.json(payload2.p_history_updates as never)},
      ${sql.json(payload2.p_identifier_inserts as never)}
    )`;
    expect(second.securityId).toBe(first.securityId);
    const count = await sql<{ n: string }[]>`select count(*)::text as n from public.securities`;
    expect(count[0].n).toBe("1");
  });

  it("idempotently inserts daily rows and rejects conflicts", async () => {
    const securityId = crypto.randomUUID();
    await sql`
      insert into public.securities (
        security_id, current_symbol, security_type, adr_status, active, resolution_state, created_at, updated_at
      ) values (
        ${securityId}, 'INTC', 'COMMON_STOCK', 'NOT_ADR', true, 'RESOLVED', ${RECORDED}, ${RECORDED}
      )
    `;
    const row = {
      security_id: securityId,
      session_date: "2024-06-03",
      observed_symbol: "INTC",
      exchange: "XNAS",
      open: "10",
      high: "11",
      low: "9",
      close: "10.5",
      volume: "1000",
      dollar_volume: "",
      previous_close: "",
      move_pct: "",
      source: "polygon-aggregates",
      source_as_of: "",
      fetched_at: "",
      computed_at: "",
      quality: "AUTHORITATIVE",
      freshness: "UNKNOWN",
      provenance: "PROVIDER",
    };
    await sql`select public.historical_apply_daily_batch(${sql.json([row] as never)})`;
    await sql`select public.historical_apply_daily_batch(${sql.json([row] as never)})`;
    await expect(
      sql`select public.historical_apply_daily_batch(${sql.json([{ ...row, close: "99" }] as never)})`,
    ).rejects.toThrow(/conflicting daily history/);
    const count = await sql<{ n: string; nulls: string }[]>`
      select count(*)::text as n,
             count(*) filter (where previous_close is null and move_pct is null)::text as nulls
      from public.security_daily_history
    `;
    expect(count[0].n).toBe("1");
    expect(count[0].nulls).toBe("1");
  });

  it("does not duplicate security/date rows on replay", async () => {
    const securityId = crypto.randomUUID();
    await sql`
      insert into public.securities (
        security_id, current_symbol, security_type, adr_status, active, resolution_state, created_at, updated_at
      ) values (
        ${securityId}, 'AAA', 'COMMON_STOCK', 'NOT_ADR', true, 'RESOLVED', ${RECORDED}, ${RECORDED}
      )
    `;
    const rows = [
      { security_id: securityId, session_date: "2024-06-03", quality: "AUTHORITATIVE", freshness: "UNKNOWN", provenance: "PROVIDER", source: "x" },
      { security_id: securityId, session_date: "2024-06-04", quality: "AUTHORITATIVE", freshness: "UNKNOWN", provenance: "PROVIDER", source: "x" },
    ];
    await sql`select public.historical_apply_daily_batch(${sql.json(rows as never)})`;
    await sql`select public.historical_apply_daily_batch(${sql.json(rows as never)})`;
    const count = await sql<{ n: string }[]>`select count(*)::text as n from public.security_daily_history`;
    expect(count[0].n).toBe("2");
  });

  it("supports backfill job checkpoint reads used for resume", async () => {
    const jobId = crypto.randomUUID();
    await sql`
      insert into public.security_backfill_jobs (
        job_id, job_type, state, date_from, date_to, cursor_date, cursor_token,
        processed_count, error_count, started_at, updated_at, metadata
      ) values (
        ${jobId}, 'SECURITY_DAILY_HISTORY', 'RUNNING', '2021-09-22', '2026-09-18',
        '2024-06-03', '0:2024-06-03', 1, 0, ${RECORDED}, ${RECORDED},
        ${sql.json({ securityIds: [crypto.randomUUID()] } as never)}
      )
    `;
    const found = await sql<{ job_id: string; state: string }[]>`
      select * from public.historical_find_interrupted_backfill_job('2021-09-22'::date, '2026-09-18'::date)
    `;
    expect(found[0]?.job_id).toBe(jobId);
    expect(found[0]?.state).toBe("RUNNING");
    await sql`
      update public.security_backfill_jobs
      set cursor_token = '0:2024-06-04', updated_at = ${RECORDED}
      where job_id = ${jobId}
    `;
    const stored = await sql<{ cursor_token: string | null }[]>`
      select cursor_token from public.security_backfill_jobs where job_id = ${jobId}
    `;
    expect(stored[0].cursor_token).toBe("0:2024-06-04");
  });
});
