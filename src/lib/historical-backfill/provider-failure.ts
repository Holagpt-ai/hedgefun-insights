/**
 * Polygon/Massive aggregate response classification for historical backfill.
 * Never treats bare HTTP 403 as a timeframe entitlement without provider evidence.
 */

import type { ProviderFailureKind, SanitizedProviderDiagnostics } from "@/types/historical-backfill";

export type { ProviderFailureKind, SanitizedProviderDiagnostics };

const TIMEFRAME_MESSAGE_MARKERS = [
  "data timeframe",
  "historical entitlements",
  "past historical entitlements",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readProviderStatus(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  return typeof payload.status === "string" ? payload.status : null;
}

function readProviderMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  return typeof payload.message === "string" ? payload.message : null;
}

function readRequestId(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  return typeof payload.request_id === "string" ? payload.request_id : null;
}

export function sanitizeProviderDiagnostics(
  httpStatus: number | null,
  payload: unknown,
): SanitizedProviderDiagnostics {
  return {
    httpStatus,
    providerStatus: readProviderStatus(payload),
    providerMessage: readProviderMessage(payload),
    requestId: readRequestId(payload),
  };
}

export function isProviderEntitlementTimeframeMessage(message: string | null): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return TIMEFRAME_MESSAGE_MARKERS.some((marker) => lower.includes(marker));
}

export function classifyPolygonAggregateResponse(
  httpStatus: number,
  payload: unknown,
): ProviderFailureKind | null {
  const providerStatus = readProviderStatus(payload);
  const providerMessage = readProviderMessage(payload);

  if (httpStatus === 429) return "PROVIDER_RATE_LIMIT";
  if (httpStatus >= 500) return "PROVIDER_RETRYABLE";

  if (providerStatus === "NOT_AUTHORIZED" || httpStatus === 403) {
    if (providerStatus === "NOT_AUTHORIZED" && isProviderEntitlementTimeframeMessage(providerMessage)) {
      return "PROVIDER_ENTITLEMENT_TIMEFRAME";
    }
    if (httpStatus === 403 && providerStatus === "NOT_AUTHORIZED") {
      return "PROVIDER_NOT_AUTHORIZED_OTHER";
    }
    if (httpStatus === 403) {
      return "PROVIDER_UNAVAILABLE";
    }
    return "PROVIDER_NOT_AUTHORIZED_OTHER";
  }

  if (providerStatus === "NOT_AUTHORIZED") {
    if (isProviderEntitlementTimeframeMessage(providerMessage)) {
      return "PROVIDER_ENTITLEMENT_TIMEFRAME";
    }
    return "PROVIDER_NOT_AUTHORIZED_OTHER";
  }

  return null;
}

export function isRecoverableEntitlementFailure(
  failureKind: ProviderFailureKind | null | undefined,
): boolean {
  return failureKind === "PROVIDER_ENTITLEMENT_TIMEFRAME";
}
