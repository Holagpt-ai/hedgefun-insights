import { useEffect } from "react";
import { AdBanner } from "@/components/layout/AdBanner";

export default function StockSplitsPage() {
  useEffect(() => {
    document.title = "Stock Split History & Guide | HedgeFun";
  }, []);

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold mb-6 text-foreground">
          Stock Split History & Guide
        </h1>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              What Is a Stock Split?
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              A stock split is a corporate action in which a company increases its total number of outstanding shares by issuing additional shares to existing shareholders in a fixed ratio, while simultaneously reducing the price per share by the same ratio. The total market capitalization of the company remains unchanged — only the number of shares and the price per share are adjusted.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              For example, in a 2-for-1 stock split, a shareholder who owned 100 shares at $200 per share would after the split own 200 shares at $100 per share. Their total position value remains $20,000. Stock splits do not create or destroy value — they are purely cosmetic adjustments to share count and price.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              Forward Splits vs. Reverse Splits
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Forward stock splits increase the share count and decrease the price. They are typically executed by companies whose share price has appreciated significantly, making the stock less accessible to retail investors. Common ratios include 2-for-1, 3-for-1, 4-for-1, and 10-for-1. Notable forward splits include Apple's 4-for-1 split in 2020 and Nvidia's 10-for-1 split in 2024.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Reverse stock splits decrease the share count and increase the price. A company executing a 1-for-10 reverse split would reduce 1,000 shares at $1 into 100 shares at $10. Reverse splits are most commonly used by companies whose share price has fallen to levels that risk delisting from major exchanges, which typically require a minimum price of $1 per share. While reverse splits can prevent delisting, they are often interpreted by the market as a sign of financial distress.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              Why Companies Execute Stock Splits
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Improved Accessibility:</strong> Lowering the per-share price makes the stock more affordable for retail investors who cannot purchase fractional shares through their brokers.</li>
              <li><strong>Increased Liquidity:</strong> More shares outstanding at a lower price typically results in higher trading volumes and tighter bid-ask spreads, improving market efficiency for the stock.</li>
              <li><strong>Index Inclusion:</strong> Some index methodologies are price-weighted (such as the Dow Jones Industrial Average), making a lower share price relevant to index inclusion decisions.</li>
              <li><strong>Psychological Signaling:</strong> A forward split implicitly signals management confidence that the stock price will continue to appreciate — otherwise the split would not be necessary.</li>
              <li><strong>Exchange Compliance:</strong> Reverse splits are used to maintain minimum price requirements set by NYSE, NASDAQ, and other exchanges to avoid delisting.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              How Stock Splits Affect Investors
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              For existing shareholders, a stock split has no immediate impact on portfolio value. All positions are adjusted proportionally on the ex-split date. However, investors should be aware of several practical considerations:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Options contracts are adjusted to reflect the new share count and strike prices post-split.</li>
              <li>Cost basis per share is adjusted automatically by most brokers, but investors should verify their records for tax purposes.</li>
              <li>Limit orders placed before a split are typically cancelled and must be re-entered at adjusted prices.</li>
              <li>Historical price charts are retroactively adjusted to reflect split-adjusted prices, which is why a stock that split 10-for-1 will show a historical price of $10 even if it traded at $100 before the split.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-3">
              Research on the long-term performance implications of stock splits is mixed. Some studies suggest forward splits are followed by modest outperformance in the near term, potentially due to increased retail investor attention and liquidity. However, the split itself is not a fundamental value driver — underlying business performance remains the primary determinant of long-term returns.
            </p>
          </section>
        </div>
      </div>

      <AdBanner slot="bottom" />
    </>
  );
}
