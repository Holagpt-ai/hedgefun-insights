import { describe, expect, it } from "vitest";
import {
  HistoricalEntitlementFloorValidationError,
  validateProviderEntitlementFloor,
} from "@/lib/historical-backfill/entitlement-floor-validation";

describe("validateProviderEntitlementFloor", () => {
  it("rejects a non-trading floor date", async () => {
    await expect(validateProviderEntitlementFloor(
      { floorDate: "2024-10-20", probeSymbol: "SPY" },
      async () => ({ httpStatus: 200, providerStatus: "OK", providerMessage: null }),
    )).rejects.toBeInstanceOf(HistoricalEntitlementFloorValidationError);
  });

  it("uses the preceding trading session for the before-floor probe", async () => {
    const probed: string[] = [];
    await validateProviderEntitlementFloor(
      { floorDate: "2024-10-22", probeSymbol: "SPY" },
      async (_symbol, sessionDate) => {
        probed.push(sessionDate);
        if (sessionDate === "2024-10-22") {
          return { httpStatus: 200, providerStatus: "OK", providerMessage: null };
        }
        return {
          httpStatus: 403,
          providerStatus: "NOT_AUTHORIZED",
          providerMessage: "Your plan doesn't include this data timeframe",
        };
      },
    );
    expect(probed).toEqual(["2024-10-22", "2024-10-21"]);
  });

  it("rejects when the preceding trading session is still provider-accessible", async () => {
    await expect(validateProviderEntitlementFloor(
      { floorDate: "2024-10-22", probeSymbol: "SPY" },
      async () => ({ httpStatus: 200, providerStatus: "OK", providerMessage: null }),
    )).rejects.toThrow(/preceding session 2024-10-21 is still accessible/);
  });
});
