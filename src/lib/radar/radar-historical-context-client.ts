import type { RepeatMoverContext } from "@/types/repeat-mover";
import type { RadarHistoricalContextEnrichmentRequest } from "@/lib/radar/radar-historical-context-types";

export interface RadarHistoricalContextBatchResponse {
  results: Array<{
    symbol: string;
    securityId: string | null;
    historicalContext: RepeatMoverContext | null;
  }>;
}

export class RadarHistoricalContextHttpError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`radar-historical-context responded with HTTP ${status}`);
    this.name = "RadarHistoricalContextHttpError";
    this.status = status;
  }
}

export class RadarHistoricalContextResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RadarHistoricalContextResponseError";
  }
}

export async function fetchRadarHistoricalContextBatch(input: {
  url: string;
  accessToken?: string | null;
  requests: readonly RadarHistoricalContextEnrichmentRequest[];
  fetchImpl?: typeof fetch;
}): Promise<RadarHistoricalContextBatchResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = input.accessToken?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    headers.apikey = token;
  }
  const res = await fetchImpl(input.url, {
    method: "POST",
    headers,
    body: JSON.stringify({ requests: input.requests }),
  });
  if (!res.ok) {
    throw new RadarHistoricalContextHttpError(res.status);
  }
  let payload: RadarHistoricalContextBatchResponse;
  try {
    payload = (await res.json()) as RadarHistoricalContextBatchResponse;
  } catch {
    throw new RadarHistoricalContextResponseError("radar-historical-context returned invalid JSON");
  }
  return payload?.results ? payload : {
    results: input.requests.map((request) => ({
      symbol: request.symbol,
      securityId: request.securityId ?? null,
      historicalContext: null,
    })),
  };
}
