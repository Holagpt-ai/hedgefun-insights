import type { Sql } from "postgres";
import type { SqlExecutor } from "@/lib/ai-trader/persistence/executor";

/** Thin postgres.js adapter. Domain SQL stays in the existing persistence modules. */
export function createPostgresQueryExecutor(sql: Sql): SqlExecutor {
  return {
    async query<T extends Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<T[]> {
      const rows = params && params.length > 0
        ? await sql.unsafe(text, [...params] as never[])
        : await sql.unsafe(text);
      return [...rows] as unknown as T[];
    },
  };
}
