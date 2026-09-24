import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { RadarHistoricalContextEnrichmentRequest } from "@/lib/radar/radar-historical-context-types";

export interface RadarHistoricalContextBatchResponse {
  results: Array<{
    symbol: string;
    securityId: string | null;
    historicalContext: RepeatMoverContext | null;
  }>;
}

export async function fetchRadarHistoricalContextBatch(input: {
  url: string;
  accessToken: string;
  requests: readonly RadarHistoricalContextEnrichmentRequest[];
  fetchImpl?: typeof fetch;
}): Promise<RadarHistoricalContextBatchResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const res = await fetchImpl(input.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests: input.requests }),
  });
  if (!res.ok) {
    return { results: input.requests.map((request) => ({
      symbol: request.symbol,
      securityId: request.securityId ?? null,
      historicalContext: null,
    })) };
  }
  let payload: RadarHistoricalContextBatchResponse;
  try {
    payload = (await res.json()) as RadarHistoricalContextBatchResponse;
  } catch {
    return {
      results: input.requests.map((request) => ({
        symbol: request.symbol,
        securityId: request.securityId ?? null,
        historicalContext: null,
      })),
    };
  }
  return payload?.results ? payload : {
    results: input.requests.map((request) => ({
      symbol: request.symbol,
      securityId: request.securityId ?? null,
      historicalContext: null,
    })),
  };
}
