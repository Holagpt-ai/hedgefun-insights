import type { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

export const ADVANCE_SIX_ARG =
  "advance_screener_sync_chunk_v1(uuid,uuid,integer,integer,jsonb,timestamptz)";

export const RELEASE_FINALIZE_LEASE_CAS =
  "release_screener_sync_finalize_lease_cas_v1(uuid,integer,uuid,timestamptz)";

export const ALL_STAGING_SYNC_RPCS = [
  ADVANCE_SIX_ARG,
  RELEASE_FINALIZE_LEASE_CAS,
  "claim_screener_sync_lease_v1(uuid,uuid,timestamptz,timestamptz,text)",
  "complete_screener_sync_publish_v1(uuid,uuid,integer,timestamptz)",
  "record_screener_sync_publish_rpc_v1(uuid,uuid,integer,uuid,integer,timestamptz)",
  "expire_screener_sync_stale_jobs_v1(timestamptz,interval)",
  "publish_screener_sync_staged_generation_v1(uuid,uuid,integer,jsonb,uuid,timestamptz,text,jsonb,timestamptz)",
] as const;

export async function hasExecute(
  client: Client,
  role: string,
  signature: string,
): Promise<boolean> {
  const result = await client.queryObject<{ ok: boolean }>(
    `SELECT has_function_privilege($1, $2::regprocedure, 'EXECUTE') AS ok`,
    [role, signature],
  );
  return result.rows[0]?.ok === true;
}

export async function publicHasExecute(
  client: Client,
  signature: string,
): Promise<boolean> {
  const result = await client.queryObject<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM pg_proc p,
            LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
       WHERE p.oid = $1::regprocedure
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
     ) AS ok`,
    [signature],
  );
  return result.rows[0]?.ok === true;
}

export async function assertStagingRpcIntendedAcl(
  client: Client,
  signature: string,
): Promise<void> {
  assertEquals(await hasExecute(client, "service_role", signature), true);
  assertEquals(await hasExecute(client, "anon", signature), false);
  assertEquals(await hasExecute(client, "authenticated", signature), false);
  assertEquals(await publicHasExecute(client, signature), false);
}

/**
 * Split SQL on statement terminators outside dollar-quoted bodies and strings.
 * Required for PL/pgSQL migrations that contain semicolons inside `AS $$ ... $$`.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "-" && next === "-") {
      i += 2;
      while (i < len && sql[i] !== "\n") i += 1;
      continue;
    }

    if (ch === "$") {
      const start = i;
      i += 1;
      let tag = "";
      while (i < len && /[A-Za-z0-9_]/.test(sql[i])) {
        tag += sql[i++];
      }
      if (i < len && sql[i] === "$") {
        const delimiter = `$${tag}$`;
        current += sql.slice(start, i + 1);
        i += 1;
        const closeAt = sql.indexOf(delimiter, i);
        if (closeAt === -1) {
          current += sql.slice(i);
          i = len;
          break;
        }
        current += sql.slice(i, closeAt + delimiter.length);
        i = closeAt + delimiter.length;
        continue;
      }
      current += "$";
      continue;
    }

    if (ch === "'") {
      current += ch;
      i += 1;
      while (i < len) {
        const c = sql[i];
        current += c;
        i += 1;
        if (c === "'") {
          if (i < len && sql[i] === "'") {
            current += sql[i];
            i += 1;
            continue;
          }
          break;
        }
      }
      continue;
    }

    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = "";
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const tail = current.trim();
  if (tail.length > 0) statements.push(tail);
  return statements;
}

export async function applySqlFile(client: Client, fileUrl: URL): Promise<void> {
  const raw = await Deno.readTextFile(fileUrl);
  const statements = splitSqlStatements(raw);
  for (const statement of statements) {
    await client.queryObject(`${statement};`);
  }
}
