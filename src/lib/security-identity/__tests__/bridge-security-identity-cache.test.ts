import { describe, expect, it, vi } from "vitest";
import type { HistoricalBridgeClient } from "@/lib/persistence/historical-bridge-client";
import { BridgeSecurityIdentityRepository } from "@/lib/security-identity/bridge-security-identity";
import type { SecurityIdentityObservation } from "@/types/security-identity";

const RECORDED = "2026-10-22T18:00:00.000Z";

function observation(overrides: Partial<SecurityIdentityObservation> = {}): SecurityIdentityObservation {
  return {
    symbol: "AAA",
    exchange: "NASDAQ",
    effectiveDate: "2024-01-02",
    issuerName: "Alpha Inc",
    securityType: "COMMON_STOCK",
    source: "polygon-reference",
    provenance: "PROVIDER",
    recordedAt: RECORDED,
    ...overrides,
  };
}

describe("BridgeSecurityIdentityRepository identity cache", () => {
  it("loads full identity tables once per worker and reuses cache across resolves", async () => {
    const fetchAllRows = vi.fn(async (action: string) => {
      if (action === "historical_list_securities") return [];
      if (action === "historical_list_symbol_history") return [];
      if (action === "historical_list_reference_identifiers") return [];
      return [];
    });
    const call = vi.fn(async () => ({ ok: true }));
    const bridge = { fetchAllRows, call } as unknown as HistoricalBridgeClient;
    const repo = new BridgeSecurityIdentityRepository(bridge, () => "11111111-1111-4111-8111-111111111111");

    await repo.resolve(observation({ symbol: "AAA" }));
    await repo.resolve(observation({ symbol: "CPS", issuerName: "Cooper Standard" }));

    expect(fetchAllRows).toHaveBeenCalledTimes(3);
    expect(call).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenNthCalledWith(1, "historical_identity_apply_diff", expect.any(Object));
    expect(call).toHaveBeenNthCalledWith(2, "historical_identity_apply_diff", expect.any(Object));
  });

  it("does not advance cache when bridge apply fails", async () => {
    const fetchAllRows = vi.fn(async () => []);
    let applyAttempts = 0;
    const call = vi.fn(async (action: string) => {
      if (action !== "historical_identity_apply_diff") return { ok: true };
      applyAttempts += 1;
      if (applyAttempts === 1) throw new Error("persist_failed");
      return { ok: true };
    });
    const bridge = { fetchAllRows, call } as unknown as HistoricalBridgeClient;
    const repo = new BridgeSecurityIdentityRepository(bridge, () => "22222222-2222-4222-8222-222222222222");

    await expect(repo.resolve(observation({ symbol: "AAA" }))).rejects.toThrow("persist_failed");
    await repo.resolve(observation({ symbol: "BBB" }));

    expect(fetchAllRows).toHaveBeenCalledTimes(3);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
