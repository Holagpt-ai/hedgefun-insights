import { useEffect } from "react";
import { AdBanner } from "@/components/layout/AdBanner";

export default function DividendsPage() {
  useEffect(() => {
    document.title = "Dividend Stocks & Tracker | HedgeFun";
  }, []);

  return (
    <>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <h1 className="text-3xl font-bold mb-6 text-foreground">
          Dividend Stocks & Tracker
        </h1>

        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              What Are Dividends?
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              A dividend is a distribution of a portion of a company's earnings paid to its shareholders, typically on a quarterly basis. Dividends represent one of the two primary ways investors generate returns from stock ownership — the other being capital appreciation. Companies that pay consistent, growing dividends are often viewed as financially stable, cash-generative businesses with mature operating models.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Not all publicly traded companies pay dividends. Growth-oriented companies typically reinvest all profits back into the business to fund expansion. Dividend payments are more common among large-cap companies in sectors such as utilities, consumer staples, financials, energy, and real estate investment trusts (REITs).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              Key Dividend Metrics Explained
            </h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Dividend Yield:</strong> The annual dividend payment divided by the current stock price, expressed as a percentage. A stock trading at $100 that pays $4 annually in dividends has a 4% yield. Yield fluctuates as stock prices move — a falling stock price causes yield to rise, which can signal either opportunity or distress depending on context.</li>
              <li><strong>Dividend Per Share (DPS):</strong> The total annual dividend payment divided by the number of outstanding shares. This is the raw dollar amount shareholders receive per share owned each year.</li>
              <li><strong>Payout Ratio:</strong> The percentage of net earnings paid out as dividends. A payout ratio of 40–60% is generally considered sustainable for most industries. Ratios above 80% may indicate the dividend is at risk if earnings decline. REITs and utilities often maintain higher payout ratios by design due to their business models.</li>
              <li><strong>Ex-Dividend Date:</strong> The cutoff date by which you must own shares to receive the upcoming dividend payment. If you purchase shares on or after the ex-dividend date, you will not receive the next dividend — it will go to the previous owner.</li>
              <li><strong>Record Date:</strong> The date on which the company reviews its shareholder registry to determine who is eligible to receive the dividend. This is typically one business day after the ex-dividend date.</li>
              <li><strong>Payment Date:</strong> The date on which the dividend is actually deposited into shareholders' brokerage accounts.</li>
              <li><strong>Dividend Growth Rate:</strong> The annualized percentage rate at which a company has increased its dividend over time. Companies that have raised dividends for 25+ consecutive years are known as Dividend Aristocrats. Those with 50+ years of increases are called Dividend Kings.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              Dividend Investing Strategies
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Dividend investing encompasses several distinct approaches depending on an investor's goals, risk tolerance, and time horizon:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>High-Yield Investing:</strong> Prioritizes stocks with above-average dividend yields, typically 4–8%. Common in sectors like utilities, REITs, and MLPs. Requires careful analysis to distinguish sustainably high yields from dividend traps.</li>
              <li><strong>Dividend Growth Investing:</strong> Focuses on companies with lower current yields but consistent dividend growth rates. The goal is compounding income over time as dividends increase annually.</li>
              <li><strong>Dividend Reinvestment (DRIP):</strong> Automatically reinvesting dividend payments to purchase additional shares, compounding returns over time without requiring additional capital contributions.</li>
              <li><strong>Income Portfolios:</strong> Building a diversified portfolio of dividend-paying stocks and ETFs designed to generate a predictable monthly or quarterly income stream, commonly used in retirement planning.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3 text-foreground">
              Risks of Dividend Investing
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              While dividends provide income stability, dividend investing carries specific risks that investors must understand. A dividend cut or suspension — which companies can implement at any time — typically causes an immediate and sharp decline in stock price. High dividend yields can be a warning sign of financial distress rather than a buying opportunity.
            </p>
            <p className="text-muted-foreground leading-relaxed mb-3">
              Interest rate environments also affect dividend stocks significantly. When interest rates rise, fixed-income alternatives become more attractive relative to dividend yields, often causing dividend-heavy sectors like utilities and REITs to underperform. Inflation can also erode the real purchasing power of fixed dividend income if dividend growth rates lag behind inflation.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Tax treatment of dividends varies by jurisdiction and investor situation. Qualified dividends in the United States are taxed at preferential capital gains rates, while ordinary dividends are taxed as regular income. Consult a tax professional for guidance specific to your situation.
            </p>
          </section>
        </div>
      </div>

      <AdBanner slot="bottom" />
    </>
  );
}
