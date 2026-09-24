import { describe, expect, it, vi } from "vitest";
import {
  fetchRadarHistoricalContextBatch,
  RadarHistoricalContextHttpError,
  RadarHistoricalContextResponseError,
} from "@/lib/radar/radar-historical-context-client";

describe("fetchRadarHistoricalContextBatch", () => {
  const requests = [{ symbol: "AAA", securityId: "s1" }] as const;

  it("A: HTTP 500 rejects instead of empty-success contexts", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(
      fetchRadarHistoricalContextBatch({
        url: "https://example.test/radar-historical-context",
        accessToken: "token",
        requests: [...requests],
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(RadarHistoricalContextHttpError);
  });

  it("B: HTTP 404 rejects as service HTTP error", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    })) as unknown as typeof fetch;

    await expect(
      fetchRadarHistoricalContextBatch({
        url: "https://example.test/radar-historical-context",
        accessToken: "token",
        requests: [...requests],
        fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("C: HTTP 200 with valid empty per-ticker contexts", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{ symbol: "AAA", securityId: null, historicalContext: null }],
      }),
    })) as unknown as typeof fetch;

    const batch = await fetchRadarHistoricalContextBatch({
      url: "https://example.test/radar-historical-context",
      accessToken: "token",
      requests: [...requests],
      fetchImpl,
    });

    expect(batch.results[0]?.historicalContext).toBeNull();
  });

  it("HTTP 200 with invalid JSON rejects as response error", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    })) as unknown as typeof fetch;

    await expect(
      fetchRadarHistoricalContextBatch({
        url: "https://example.test/radar-historical-context",
        accessToken: "token",
        requests: [...requests],
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(RadarHistoricalContextResponseError);
  });
});
