const EDGE_URL = `https://zcjptaolpumhtlwhlemq.supabase.co/functions/v1/market-data`;

export interface SearchResult {
  ticker: string;
  name: string;
  exchange: string | null;
  type: string | null;
}

export const EXCHANGE_LABELS: Record<string, string> = {
  XNAS: "NASDAQ",
  XNYS: "NYSE",
  XASE: "NYSE AMEX",
  ARCX: "NYSE ARCA",
  XOTC: "OTC",
  PINX: "OTC Pink",
  OTCB: "OTCQB",
  OTCQ: "OTCQX",
  BATS: "CBOE",
};

export const TYPE_LABELS: Record<string, string> = {
  CS: "Stock",
  ETF: "ETF",
  WARRANT: "Warrant",
  RIGHT: "Right",
  UNIT: "Unit",
  PFD: "Preferred",
  FUND: "Fund",
  SP: "Structured Product",
  ADRC: "ADR",
};

export async function searchTickers(query: string): Promise<SearchResult[]> {
  if (!query || query.trim().length < 1) return [];
  try {
    const res = await fetch(
      `${EDGE_URL}?type=search&query=${encodeURIComponent(query.trim())}`,
      { signal: AbortSignal.timeout(3000) }
    );
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}
