/** Postgres unique_violation. Cross-invocation races resume the winning row. */
export class UniqueConflictError extends Error {
  readonly code = "23505";
  constructor() {
    super("unique_conflict");
    this.name = "UniqueConflictError";
  }
}

export function isUniqueConflict(error: unknown): boolean {
  if (error instanceof UniqueConflictError) return true;
  if (!error || typeof error !== "object") return false;
  return (error as { code?: string }).code === "23505";
}

export function mapDatabaseError(error: { code?: string } | null): Error | null {
  if (!error) return null;
  if (error.code === "23505") return new UniqueConflictError();
  return new Error("database");
}
