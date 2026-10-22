import { describe, expect, it } from "vitest";
import {
  classifyPolygonAggregateResponse,
  isProviderEntitlementTimeframeMessage,
  isRecoverableEntitlementFailure,
} from "@/lib/historical-backfill/provider-failure";

describe("provider failure classification", () => {
  it("classifies timeframe NOT_AUTHORIZED with provider evidence", () => {
    const kind = classifyPolygonAggregateResponse(403, {
      status: "NOT_AUTHORIZED",
      message: "Your plan doesn't include this data timeframe. Please upgrade your plan",
      request_id: "abc",
    });
    expect(kind).toBe("PROVIDER_ENTITLEMENT_TIMEFRAME");
    expect(isRecoverableEntitlementFailure(kind)).toBe(true);
  });

  it("does not classify bare HTTP 403 as timeframe restriction", () => {
    expect(classifyPolygonAggregateResponse(403, {})).toBe("PROVIDER_UNAVAILABLE");
    expect(classifyPolygonAggregateResponse(403, { status: "ERROR" })).toBe("PROVIDER_UNAVAILABLE");
  });

  it("classifies other NOT_AUTHORIZED responses separately", () => {
    const kind = classifyPolygonAggregateResponse(403, {
      status: "NOT_AUTHORIZED",
      message: "You are not entitled to this data. Please upgrade your plan",
    });
    expect(kind).toBe("PROVIDER_NOT_AUTHORIZED_OTHER");
    expect(isRecoverableEntitlementFailure(kind)).toBe(false);
  });

  it("classifies retryable transport failures", () => {
    expect(classifyPolygonAggregateResponse(429, { status: "ERROR" })).toBe("PROVIDER_RATE_LIMIT");
    expect(classifyPolygonAggregateResponse(503, { status: "ERROR" })).toBe("PROVIDER_RETRYABLE");
  });

  it("matches documented timeframe message markers", () => {
    expect(isProviderEntitlementTimeframeMessage("Attempted to request data past historical entitlements")).toBe(true);
    expect(isProviderEntitlementTimeframeMessage("Forbidden")).toBe(false);
  });
});
