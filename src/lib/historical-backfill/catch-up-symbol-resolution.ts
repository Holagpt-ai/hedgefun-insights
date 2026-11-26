import type { SecurityId } from "@/types/security-identity";

/** Outcome of a catch-up identity probe (no synthetic history). */
export type CatchUpSymbolResolutionKind =
  | "resolved"
  | "unsupported_ticker"
  | "ambiguous_identity";

export type CatchUpSymbolResolution = {
  symbol: string;
  kind: CatchUpSymbolResolutionKind;
  securityId?: SecurityId;
  /** Sanitized provider evidence only. */
  providerStatus?: string | null;
  providerHttpStatus?: number;
};

export function classifyPolygonReferenceRow(input: {
  httpStatus: number;
  body: Record<string, unknown>;
}): Pick<CatchUpSymbolResolution, "kind" | "providerStatus" | "providerHttpStatus"> {
  const status = typeof input.body.status === "string" ? input.body.status : null;
  const row = input.body.results && typeof input.body.results === "object"
    ? input.body.results as Record<string, unknown>
    : null;
  if (input.httpStatus === 404 || status === "NOT_FOUND" || !row || row.ticker == null) {
    return {
      kind: "unsupported_ticker",
      providerStatus: status,
      providerHttpStatus: input.httpStatus,
    };
  }
  if (input.httpStatus !== 200) {
    return {
      kind: "ambiguous_identity",
      providerStatus: status,
      providerHttpStatus: input.httpStatus,
    };
  }
  return {
    kind: "resolved",
    providerStatus: status,
    providerHttpStatus: input.httpStatus,
  };
}

export type CatchUpResolutionBatchStats = {
  scanned: number;
  resolved: SecurityId[];
  deferred: CatchUpSymbolResolution[];
};

export function summarizeDeferredByKind(
  deferred: readonly CatchUpSymbolResolution[],
): Record<CatchUpSymbolResolutionKind, number> {
  const out: Record<CatchUpSymbolResolutionKind, number> = {
    resolved: 0,
    unsupported_ticker: 0,
    ambiguous_identity: 0,
  };
  for (const row of deferred) {
    if (row.kind !== "resolved") out[row.kind] += 1;
  }
  return out;
}