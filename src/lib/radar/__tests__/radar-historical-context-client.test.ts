import { describe, expect, it, vi } from "vitest";
import { fetchRadarHistoricalContextBatch } from "@/lib/radar/radar-historical-context-client";

describe("fetchRadarHistoricalContextBatch", () => {
  const requests = [{ symbol: "AAA", securityId: "s1" }] as const;

  it("returns null contexts when response JSON is malformed", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    })) as unknown as typeof fetch;

    const batch = await fetchRadarHistoricalContextBatch({
      url: "https://example.test/radar-historical-context",
      accessToken: "token",
      requests: [...requests],
      fetchImpl,
    });

    expect(batch.results).toHaveLength(1);
    expect(batch.results[0]?.historicalContext).toBeNull();
  });

  it("surfaces HTTP failures as empty contexts without throwing", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(
      fetchRadarHistoricalContextBatch({
        url: "https://example.test/radar-historical-context",
        accessToken: "token",
        requests: [...requests],
        fetchImpl,
      }),
    ).resolves.toMatchObject({ results: [{ symbol: "AAA", historicalContext: null }] });
  });
});
