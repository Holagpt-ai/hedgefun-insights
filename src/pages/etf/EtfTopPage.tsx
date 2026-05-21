import { useEffect } from "react";
import { AdBanner } from "@/components/layout/AdBanner";

export default function EtfTopPage() {
  useEffect(() => {
    document.title = "Top ETFs by Category | HedgeFun";
  }, []);

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-8">
            Top ETFs by Category
          </h1>

          <div className="space-y-10">
            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                What Is an ETF?
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                An exchange-traded fund (ETF) is an investment fund that holds a basket of underlying assets — such as stocks, bonds, commodities, or currencies — and trades on a stock exchange throughout the day just like an individual stock. ETFs combine the diversification benefits of a mutual fund with the intraday liquidity and price transparency of a stock, making them one of the most widely used investment vehicles for both retail and institutional investors.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                Unlike actively managed mutual funds, the majority of ETFs are passively managed, meaning they track a specific index, sector, commodity, or asset class rather than relying on a portfolio manager to select individual securities. This passive structure results in significantly lower expense ratios compared to actively managed funds, which directly benefits long-term investor returns through cost compounding.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                Major ETF Categories
              </h2>

              <ul className="space-y-4 text-muted-foreground list-disc list-inside">
                <li>
                  <strong className="text-foreground">Broad Market Index ETFs:</strong> Track major stock market indexes such as the S&P 500, Nasdaq-100, Dow Jones Industrial Average, or total market indexes. Examples include funds tracking the S&P 500 from providers like Vanguard, BlackRock iShares, and State Street SPDR. These are the most widely held ETFs by assets under management globally and are the foundation of most passive investment portfolios.
                </li>

                <li>
                  <strong className="text-foreground">Sector ETFs:</strong> Provide targeted exposure to specific economic sectors such as technology, healthcare, financials, energy, utilities, consumer staples, and real estate. Sector ETFs allow investors to overweight or underweight specific parts of the economy based on macroeconomic views or thematic convictions without selecting individual stocks.
                </li>

                <li>
                  <strong className="text-foreground">Bond and Fixed Income ETFs:</strong> Hold portfolios of government bonds, corporate bonds, municipal bonds, or international debt. Bond ETFs provide income generation and portfolio diversification, with varying duration profiles from ultra-short-term treasury bills to long-duration government bonds. They are commonly used by investors seeking lower volatility and predictable income streams.
                </li>

                <li>
                  <strong className="text-foreground">International and Emerging Market ETFs:</strong> Offer exposure to equity markets outside the United States, including developed markets in Europe, Japan, and Australia, as well as emerging markets in China, India, Brazil, and other high-growth economies. These ETFs introduce currency risk in addition to equity risk but provide geographic diversification beyond U.S. markets.
                </li>

                <li>
                  <strong className="text-foreground">Commodity ETFs:</strong> Track the price of physical commodities such as gold, silver, oil, natural gas, or agricultural products. Some commodity ETFs hold the physical asset directly (particularly gold ETFs), while others use futures contracts to gain price exposure. Commodity ETFs are commonly used as inflation hedges and portfolio diversifiers.
                </li>

                <li>
                  <strong className="text-foreground">Thematic ETFs:</strong> Focus on specific investment themes or trends such as artificial intelligence, clean energy, cybersecurity, genomics, or electric vehicles. Thematic ETFs carry higher concentration risk than broad market funds but appeal to investors with conviction in specific long-term trends.
                </li>

                <li>
                  <strong className="text-foreground">Dividend ETFs:</strong> Hold portfolios of high-dividend-yielding or dividend-growth stocks. These ETFs are popular among income-focused investors, particularly in retirement portfolios seeking regular cash distributions.
                </li>

                <li>
                  <strong className="text-foreground">Leveraged and Inverse ETFs:</strong> Use derivatives to deliver multiples of daily index returns (2x or 3x leveraged) or the inverse of daily returns. These are short-term trading instruments, not long-term investments, due to the compounding effects of daily rebalancing that cause significant performance divergence from the underlying index over time.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                How to Evaluate an ETF
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                When selecting an ETF, investors should evaluate several key metrics beyond simply the fund's recent performance:
              </p>

              <ul className="space-y-4 text-muted-foreground list-disc list-inside">
                <li>
                  <strong className="text-foreground">Expense Ratio:</strong> The annual fee charged by the fund as a percentage of assets. For broad index ETFs, expense ratios below 0.10% are common and preferred. Higher expense ratios must be justified by unique exposure or active management that delivers consistent outperformance.
                </li>

                <li>
                  <strong className="text-foreground">Assets Under Management (AUM):</strong> Larger funds generally have better liquidity, tighter bid-ask spreads, and lower tracking error. ETFs with AUM below $100 million carry higher closure risk.
                </li>

                <li>
                  <strong className="text-foreground">Tracking Error:</strong> The degree to which the ETF's returns deviate from its benchmark index. Lower tracking error indicates more efficient index replication.
                </li>

                <li>
                  <strong className="text-foreground">Liquidity and Average Daily Volume:</strong> Higher trading volume results in tighter bid-ask spreads, reducing the transaction cost of buying and selling the ETF.
                </li>

                <li>
                  <strong className="text-foreground">Index Methodology:</strong> Understanding how the underlying index selects and weights its components is critical. Market-cap weighted, equal-weighted, factor-weighted, and fundamentally weighted indexes produce materially different return profiles even within the same asset class.
                </li>

                <li>
                  <strong className="text-foreground">Distribution Frequency:</strong> ETFs distribute income (dividends or interest) on varying schedules — monthly, quarterly, or annually. Income-focused investors should verify distribution frequency matches their cash flow needs.
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-foreground mb-4">
                ETF Risks to Understand
              </h2>

              <p className="text-muted-foreground leading-relaxed mb-4">
                While ETFs are generally considered lower-risk than individual stocks due to their built-in diversification, they are not without risk. Market risk affects all equity ETFs — a broad market decline will reduce the value of index ETFs proportionally. Sector and thematic ETFs carry concentration risk that can result in losses significantly larger than the broad market during sector-specific downturns.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                International ETFs introduce currency exchange rate risk in addition to equity market risk. Commodity ETFs backed by futures contracts are subject to contango and backwardation effects that can cause the ETF to underperform the spot price of the underlying commodity over time. Leveraged and inverse ETFs are subject to volatility decay that makes them unsuitable for holding periods longer than a single trading session for most investors.
              </p>

              <p className="text-muted-foreground leading-relaxed mb-4">
                Liquidity risk exists for ETFs with low trading volumes — wide bid-ask spreads can result in significant transaction costs, particularly for large orders. In extreme market stress scenarios, even relatively liquid ETFs can experience temporary pricing dislocations from their underlying net asset value.
              </p>
            </section>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 pb-8">
        <AdBanner slot="bottom" />
      </div>
    </>
  );
}
