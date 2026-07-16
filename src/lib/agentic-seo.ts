// Stocksist Agentic SEO Engine — Ghost Protocol v1
// Generator: Gemini 2.0 Flash | Auditor: Claude Haiku
// CTS 4-Signal trigger (price/volume/analyst/search, threshold 0.65)
// NOTE: Generation logic is intentionally stubbed — V2 implementation pending.

export interface CTSSignal {
  symbol: string;
  priceSignal: number;      // 0-1 normalized
  volumeSignal: number;     // 0-1 normalized
  analystSignal: number;    // 0-1 normalized
  searchSignal: number;     // 0-1 normalized
  compositeScore: number;   // must exceed 0.65 for T2/T3
  tier: 'T1' | 'T2' | 'T3'; // T1 = S&P 500 always, T2/T3 = CTS-gated
}

export interface AgenticSEOPage {
  symbol: string;
  pageType: 'overview' | 'financials' | 'news' | 'comparison';
  metaTitle: string;
  metaDescription: string;
  h1: string;
  generatedContent: string;
  generatorModel: string;
  auditorModel: string;
  auditPassed: boolean;
  auditScore: number;
  generatedAt: Date;
}

export interface SitemapConfig {
  core: string[];
  tickers: string[];
  programmatic: string[];
  reviews: string[];
}

export function generateMetaTitle(ticker: string, companyName?: string): string {
  return companyName
    ? `${companyName} (${ticker}) Stock Price, News & Analysis | Stocksist`
    : `${ticker} Stock Price, News & Analysis | Stocksist`;
}

export function generateMetaDescription(ticker: string, companyName?: string): string {
  const name = companyName ? `${companyName} (${ticker})` : ticker;
  return `Get the latest ${name} stock price, news, financials, analyst ratings, and market analysis on Stocksist.`;
}

// STUBBED — do not implement generation logic in V1
export async function generateTickerContent(signal: CTSSignal): Promise<AgenticSEOPage | null> {
  if (signal.compositeScore < 0.65 && signal.tier !== 'T1') return null;
  // TODO (V2): Call Gemini 2.0 Flash generator
  // TODO (V2): Pass output to Claude Haiku auditor
  // TODO (V2): Log result to Supabase agentic_seo_log
  return null;
}

export function buildSitemapConfig(tickers: string[]): SitemapConfig {
  return {
    core: ['/', '/screener', '/movers', '/ipos', '/earnings', '/news', '/pro'],
    tickers: tickers.map(t => `/stocks/${t.replace('.', '-').toLowerCase()}`),
    programmatic: [],
    reviews: [],
  };
}
