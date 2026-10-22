import { describe, expect, it } from "vitest";
import { planSegmentWithEntitlementFloor } from "@/lib/historical-backfill/entitlement-segments";

describe("planSegmentWithEntitlementFloor", () => {
  it("records a config gap and fetches the entitled tail", () => {
    const planned = planSegmentWithEntitlementFloor(
      { symbol: "OBE", exchange: "XASE", dateFrom: "2021-09-22", dateTo: "2026-10-20" },
      "2024-10-22",
    );
    expect(planned).toEqual([
      {
        kind: "config_entitlement_gap",
        symbol: "OBE",
        exchange: "XASE",
        dateFrom: "2021-09-22",
        dateTo: "2024-10-21",
      },
      {
        kind: "fetch",
        segment: {
          symbol: "OBE",
          exchange: "XASE",
          dateFrom: "2024-10-22",
          dateTo: "2026-10-20",
        },
      },
    ]);
  });

  it("leaves in-window segments unchanged when no floor is configured", () => {
    const segment = { symbol: "AAA", exchange: null, dateFrom: "2024-01-01", dateTo: "2024-06-01" };
    expect(planSegmentWithEntitlementFloor(segment, null)).toEqual([{ kind: "fetch", segment }]);
  });
});
