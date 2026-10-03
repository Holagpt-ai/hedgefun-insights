// Explicit SEC operations. Callers cannot supply an upstream URL.

export interface SecOperation {
  id: "latest-filings" | "company-ticker-map";
  method: "GET";
  path: string;
  upstreamUrl: string;
  enabled: boolean;
}

export const LATEST_FILINGS_UPSTREAM_URL =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&owner=exclude&count=100&start=0&output=atom";

export const COMPANY_TICKER_MAP_UPSTREAM_URL =
  "https://www.sec.gov/files/company_tickers_exchange.json";

export const SEC_OPERATIONS: readonly SecOperation[] = [
  {
    id: "latest-filings",
    method: "GET",
    path: "/v1/sec/latest-filings",
    upstreamUrl: LATEST_FILINGS_UPSTREAM_URL,
    enabled: true,
  },
  {
    id: "company-ticker-map",
    method: "GET",
    path: "/v1/sec/company-ticker-map",
    upstreamUrl: COMPANY_TICKER_MAP_UPSTREAM_URL,
    enabled: false,
  },
];

export function matchSecOperation(method: string, pathname: string): SecOperation | null {
  return SEC_OPERATIONS.find((operation) => operation.method === method && operation.path === pathname) ?? null;
}
