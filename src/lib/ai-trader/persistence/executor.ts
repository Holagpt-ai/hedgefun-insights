export type PersistenceCode = "NOT_SUPPORTED_YET" | "TABLES_NOT_APPLIED";

export class MemoryPersistenceError extends Error {
  readonly code: PersistenceCode;

  constructor(code: PersistenceCode, message: string) {
    super(message);
    this.name = "MemoryPersistenceError";
    this.code = code;
  }
}

/** Injected query runner. No client is created at import time. */
export interface SqlExecutor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<T[]>;
}

export function isUndefinedTableError(error: unknown): boolean {
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = error instanceof Error ? error.message : String(error);
  return code === "42P01" || /relation .* does not exist/i.test(message);
}
