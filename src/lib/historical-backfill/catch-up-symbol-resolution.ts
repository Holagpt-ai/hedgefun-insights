import {
  classifyPolygonAggregateResponse,
  isProviderEntitlementTimeframeMessage,
} from "@/lib/historical-backfill/provider-failure";
import type { SecurityId } from "@/types/security-identity";

/** Outcome of a catch-up identity probe (no synthetic history). */
export type CatchUpSymbolResolutionKind =
  | "resolved"
  | "unsupported_ticker"
  | "ambiguous_identity"
  | "provider_entitlement"
  | "provider_rate_limited"
  | "provider_transient"
  | "provider_invalid_response";

export type CatchUpSymbolResolution = {
  symbol: string;
  kind: CatchUpSymbolResolutionKind;
  securityId?: SecurityId;
  providerStatus?: string | null;
  providerHttpStatus?: number;
};

const DEFERRABLE_KINDS = new Set<CatchUpSymbolResolutionKind>([
  "unsupported_ticker",
  "ambiguous_identity",
]);

const RETRYABLE_KINDS = new Set<CatchUpSymbolResolutionKind>([
  "provider_entitlement",
  "provider_rate_limited",
  "provider_transient",
  "provider_invalid_response",
]);

export function isDeferrableCatchUpResolutionKind(
  kind: CatchUpSymbolResolutionKind,
): kind is "unsupported_ticker" | "ambiguous_identity" {
  return DEFERRABLE_KINDS.has(kind);
}

export function isRetryableCatchUpResolutionKind(kind: CatchUpSymbolResolutionKind): boolean {
  return RETRYABLE_KINDS.has(kind);
}

export class CatchUpProviderResolutionError extends Error {
  readonly kind: CatchUpSymbolResolutionKind;
  readonly symbol: string;
  readonly providerHttpStatus: number;
  readonly providerStatus: string | null;

  constructor(input: {
    kind: CatchUpSymbolResolutionKind;
    symbol: string;
    providerHttpStatus: number;
    providerStatus: string | null;
  }) {
    super(`provider resolution blocked for ${input.symbol}: ${input.kind}`);
    this.name = "CatchUpProviderResolutionError";
    this.kind = input.kind;
    this.symbol = input.symbol;
    this.providerHttpStatus = input.providerHttpStatus;
    this.providerStatus = input.providerStatus;
  }
}

export function classifyPolygonReferenceResponse(input: {
  httpStatus: number;
  body: Record<string, unknown>;
}): Pick<CatchUpSymbolResolution, "kind" | "providerStatus" | "providerHttpStatus"> {
  const status = typeof input.body.status === "string" ? input.body.status : null;
  const message = typeof input.body.message === "string" ? input.body.message : null;
  const row = input.body.results && typeof input.body.results === "object"
    ? input.body.results as Record<string, unknown>
    : null;

  if (input.httpStatus === 429 || classifyPolygonAggregateResponse(input.httpStatus, input.body) === "PROVIDER_RATE_LIMIT") {
    return { kind: "provider_rate_limited", providerStatus: status, providerHttpStatus: input.httpStatus };
  }
  if (
    input.httpStatus >= 500
    || classifyPolygonAggregateResponse(input.httpStatus, input.body) === "PROVIDER_RETRYABLE"
  ) {
    return { kind: "provider_transient", providerStatus: status, providerHttpStatus: input.httpStatus };
  }

  const failureKind = classifyPolygonAggregateResponse(input.httpStatus, input.body);
  if (
    failureKind === "PROVIDER_ENTITLEMENT_TIMEFRAME"
    || failureKind === "PROVIDER_NOT_AUTHORIZED_OTHER"
    || (input.httpStatus === 403 && isProviderEntitlementTimeframeMessage(message))
    || (status === "NOT_AUTHORIZED" && isProviderEntitlementTimeframeMessage(message))
  ) {
    return { kind: "provider_entitlement", providerStatus: status, providerHttpStatus: input.httpStatus };
  }

  if (input.httpStatus === 404 || status === "NOT_FOUND") {
    return { kind: "unsupported_ticker", providerStatus: status, providerHttpStatus: input.httpStatus };
  }

  if (row && row.ticker != null && input.httpStatus === 200 && (status === "OK" || status == null)) {
    return { kind: "resolved", providerStatus: status ?? "OK", providerHttpStatus: input.httpStatus };
  }

  if (!row || row.ticker == null) {
    if (input.httpStatus === 403) {
      return { kind: "provider_entitlement", providerStatus: status, providerHttpStatus: input.httpStatus };
    }
    if (status === "NOT_AUTHORIZED") {
      return { kind: "provider_entitlement", providerStatus: status, providerHttpStatus: input.httpStatus };
    }
    if (input.httpStatus === 200) {
      return { kind: "provider_invalid_response", providerStatus: status, providerHttpStatus: input.httpStatus };
    }
    return { kind: "ambiguous_identity", providerStatus: status, providerHttpStatus: input.httpStatus };
  }

  if (input.httpStatus === 200) {
    return { kind: "provider_invalid_response", providerStatus: status, providerHttpStatus: input.httpStatus };
  }

  return { kind: "ambiguous_identity", providerStatus: status, providerHttpStatus: input.httpStatus };
}

export function summarizeDeferredByKind(
  deferred: readonly CatchUpSymbolResolution[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of deferred) {
    if (!isDeferrableCatchUpResolutionKind(row.kind)) continue;
    out[row.kind] = (out[row.kind] ?? 0) + 1;
  }
  return out;
}

/** @deprecated use classifyPolygonReferenceResponse */
export function classifyPolygonReferenceRow(input: {
  httpStatus: number;
  body: Record<string, unknown>;
}): Pick<CatchUpSymbolResolution, "kind" | "providerStatus" | "providerHttpStatus"> {
  return classifyPolygonReferenceResponse(input);
}