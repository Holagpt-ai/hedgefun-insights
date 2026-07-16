import { useEffect } from "react";
import { AdBanner } from "@/components/layout/AdBanner";

export default function MethodologyPage() {
  useEffect(() => {
    document.title = "Data & Methodology | Stocksist";
  }, []);

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold mb-6 text-foreground">
          Data Sources & Methodology
        </h1>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              How We Source Market Data
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Stocksist aggregates financial data from multiple regulated, institutional-grade sources. Our primary market data provider is Polygon.io, a licensed financial data platform that delivers real-time and historical price quotes, trade-level data, corporate actions, and options chain data directly from U.S. exchanges including NYSE, NASDAQ, CBOE, and OTC Markets.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-3">
              All stock prices, ETF net asset values, index levels, and options Greeks displayed on Stocksist are sourced from Polygon.io feeds. We do not generate, estimate, or fabricate any raw market data. Every figure you see on Stocksist originates from a regulated exchange or licensed data provider.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-3">
              For IPO data, we compile listings from SEC EDGAR filings (S-1 and F-1 registration statements), official exchange announcements from NASDAQ and NYSE, and verified company press releases. IPO pricing and allocation data is updated as official information becomes available from underwriting firms.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Earnings calendar data is sourced from a combination of SEC filings (10-Q and 10-K reports), exchange earnings notification systems, and verified investor relations announcements. We cross-reference multiple sources to minimize scheduling errors, though investors should always verify earnings dates directly with the reporting company.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              AI Agent Methodology
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Stocksist uses a proprietary multi-agent AI architecture built on large language models (LLMs) to generate analytical summaries, research insights, and market commentary. Our AI system is designed around a Socratic reasoning framework — rather than delivering blunt buy/sell signals, the AI agents are prompted to challenge assumptions, surface contradictory evidence, and present multiple analytical perspectives for each ticker or market scenario.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Our AI pipeline operates in two stages. In the first stage, a generation agent produces an initial analytical draft using live market data, financial statements, and historical price context. In the second stage, a separate auditing agent reviews the draft for factual consistency, logical coherence, and alignment with the underlying data. Only outputs that pass the audit stage are published to the platform.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              All AI-generated content on Stocksist is clearly labeled as machine-generated analysis. It is provided for informational and educational purposes only and does not constitute personalized financial advice, a solicitation to buy or sell any security, or a guarantee of future performance. Users must independently verify all AI-generated claims before making any investment decision.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              Data Update Frequency
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Different data types on Stocksist update at different frequencies depending on source availability and exchange rules:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Real-time stock and ETF quotes: Continuous during regular market hours (9:30 AM – 4:00 PM ET, Monday–Friday)</li>
              <li>Pre-market and after-hours data: Updated every 1–5 minutes during extended sessions (4:00 AM – 9:30 AM and 4:00 PM – 8:00 PM ET)</li>
              <li>Market movers (gainers, losers, most active): Refreshed every 5 minutes during market hours</li>
              <li>News aggregation: Refreshed every 5–15 minutes from financial wire services</li>
              <li>Earnings calendar: Synced daily with SEC filings and exchange notifications</li>
              <li>IPO listings: Updated daily as new S-1 filings and pricing announcements are released</li>
              <li>Financial statements (income, balance sheet, cash flow): Updated quarterly following SEC filing deadlines</li>
              <li>AI-generated summaries: Generated and audited daily for newly enriched tickers</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              Editorial Standards
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Stocksist maintains a strict separation between data reporting and editorial opinion. All market data displayed on the platform is sourced directly from third-party providers without editorial modification. Where Stocksist editorial commentary appears — including AI-generated summaries, sector analyses, and market overviews — it is clearly labeled and distinguished from raw data.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-3">
              We do not accept payment to feature, promote, or favorably present any stock, ETF, or financial product. Our screener rankings, stock lists, and analytical outputs are determined entirely by objective data criteria. Stocksist has no brokerage relationships and does not earn commissions on securities transactions.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Errors and corrections are taken seriously. If you identify a data discrepancy or factual error on the platform, please contact us at{" "}
              <a href="mailto:info@stocksist.com" className="text-primary hover:underline">info@stocksist.com</a>{" "}
              with the specific page URL and the nature of the error. Confirmed errors are corrected within one business day.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              Limitations & Risk Disclosure
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              All financial data is subject to delays, errors, and omissions beyond Stocksist's control. Market data feeds can experience interruptions during periods of extreme volatility, system maintenance, or exchange-level outages. Stocksist implements a caching layer to minimize data gaps, but users should be aware that displayed data may not always reflect the absolute latest market conditions.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Past performance of any stock, ETF, index, or investment strategy displayed on Stocksist does not guarantee or predict future results. Investing in securities involves risk, including the possible loss of principal. Stocksist is an informational platform only — nothing on this site constitutes personalized investment advice. Always consult a licensed financial advisor before making investment decisions.
            </p>
          </section>
        </div>
      </div>

      <AdBanner slot="bottom" />
    </>
  );
}
