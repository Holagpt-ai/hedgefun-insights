import postgres, { type Sql, type TransactionSql } from "postgres";

export const LOCAL_PILOT_DATABASE_URL =
  "postgres://pilot:pilot_local_only@127.0.0.1:54329/historical_backfill_pilot";

export type PilotSql = Sql | TransactionSql;

/** Refuses any non-local or Supabase connection. The pilot database is disposable. */
export function assertLocalPilotDatabaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("pilot database url is invalid");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("pilot database must use postgres");
  }
  if (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "localhost") {
    throw new Error("pilot database must be localhost");
  }
  if (/supabase|amazonaws|pooler/i.test(url)) {
    throw new Error("pilot database must not be a hosted database");
  }
}

export function openLocalPilotSql(url: string = LOCAL_PILOT_DATABASE_URL): Sql {
  assertLocalPilotDatabaseUrl(url);
  return postgres(url, { max: 4, prepare: false, connect_timeout: 10 });
}

export async function resetLocalPilotTables(sql: Sql): Promise<void> {
  await sql.unsafe(`
    TRUNCATE TABLE
      public.event_reaction_links,
      public.forward_outcomes,
      public.security_episode_events,
      public.market_behavior_episodes,
      public.corporate_events,
      public.security_daily_history,
      public.security_backfill_jobs,
      public.security_symbol_history,
      public.security_reference_identifiers,
      public.securities
    RESTART IDENTITY CASCADE
  `);
}
