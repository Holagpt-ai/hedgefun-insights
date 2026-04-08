import { useEffect } from "react";
import { AdBanner } from "@/components/layout/AdBanner";
import { Link } from "react-router-dom";

export default function DisclaimerPage() {
  useEffect(() => {
    document.title = "Data Disclaimer & Risk Disclosure | HedgeFun";
  }, []);

  return (
    <>
      <div className="max-w-[800px] mx-auto px-6 py-12">
        <h1 className="text-[1.75rem] font-bold text-foreground border-b-2 border-border pb-3 mb-4">
          Data Disclaimer &amp; Risk Disclosure
        </h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: April 8, 2026</p>

        <div className="text-base leading-[1.8] text-foreground space-y-6">
          {/* ── 1. General Disclaimer ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">1. General Disclaimer</h2>
            <p>
              HedgeFun ("<strong>hedgefun.fun</strong>," "we," "us," or "our") is an independent financial data
              aggregation and educational technology platform. All content published on this website — including but
              not limited to stock quotes, charts, analyst ratings, earnings calendars, IPO data, screener results,
              AI-generated analysis, and editorial commentary — is provided strictly for <strong>informational and
              educational purposes only</strong>. Nothing on this website constitutes, or is intended to constitute,
              financial advice, investment advice, trading advice, tax advice, legal advice, or any other form of
              professional advice. You should not treat any of the content on this website as a recommendation,
              endorsement, or solicitation to buy, sell, or hold any security or financial instrument.
            </p>
          </section>

          {/* ── 2. Not a Registered Financial Professional ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">2. Not a Registered Financial Professional</h2>
            <p>
              HedgeFun is <strong>NOT</strong> a registered broker-dealer, investment advisor, financial planner,
              Commodity Trading Advisor (CTA), or Registered Investment Advisor (RIA) with the U.S. Securities and
              Exchange Commission (SEC), the Financial Industry Regulatory Authority (FINRA), the Commodity Futures
              Trading Commission (CFTC), or any state securities regulatory authority. HedgeFun does not manage
              client assets, execute trades on behalf of users, or provide personalized portfolio recommendations.
              Any data, scores, ratings, or analytical outputs presented on this platform are algorithmic in nature
              and do not account for your individual financial situation, risk tolerance, investment objectives, or
              time horizon. Before making any investment decision, you should consult with a qualified, licensed
              financial advisor who is aware of your specific circumstances.
            </p>
          </section>

          {/* ── 3. Risk Warning — Options & Credit Spreads ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">3. Severe Risk Warning — Options Trading &amp; Credit Spreads</h2>
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-3">
              <p className="font-semibold text-destructive mb-2">⚠ HIGH-RISK ACTIVITY WARNING</p>
              <p>
                Options trading, including but not limited to credit spreads, iron condors, straddles, strangles,
                and naked options, involves a <strong>substantial risk of loss</strong> and is not appropriate for
                all investors. You can lose your entire investment, and in some cases, losses may exceed your
                initial deposit. Credit spreads carry the specific risk of maximum loss equal to the width of the
                spread minus the premium received, and adverse market moves can result in rapid, significant losses.
              </p>
            </div>
            <p>
              Past performance of any strategy, algorithm, or analytical tool presented on HedgeFun is not
              indicative of future results. Simulated or backtested results do not represent actual trading and may
              not account for slippage, commissions, market impact, or liquidity constraints. The complexity and
              leverage inherent in options trading magnify both gains and losses. You should only trade options with
              capital you can afford to lose entirely, and you must fully understand the mechanics and risks of each
              strategy before entering any position. HedgeFun strongly recommends that you consult with a licensed
              financial professional before engaging in options trading of any kind.
            </p>
          </section>

          {/* ── 4. AI & Data Methodology Disclosure ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">4. AI &amp; Data Methodology Disclosure</h2>
            <p>
              HedgeFun utilizes artificial intelligence (AI) models, including large language models (LLMs) and
              proprietary Socratic reasoning agents, to generate analytical summaries, sentiment scores, earnings
              commentary, and other data-driven insights. These AI systems are designed to assist with research and
              education; however, they are subject to significant limitations:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>
                <strong>Hallucinations &amp; Inaccuracies:</strong> AI models may produce factually incorrect
                statements, fabricate data points, misinterpret financial filings, or generate plausible-sounding
                but erroneous analysis. All AI-generated content should be independently verified before reliance.
              </li>
              <li>
                <strong>Third-Party Data Sources:</strong> Market data, stock prices, financial statements, analyst
                ratings, and related information are sourced from third-party providers including, but not limited
                to, <strong>Polygon.io</strong>, SEC EDGAR filings, and other publicly available APIs. While we
                endeavor to present accurate data, we do not guarantee the accuracy, completeness, timeliness, or
                reliability of any third-party data.
              </li>
              <li>
                <strong>Data Delays:</strong> Stock prices and market data may be delayed by up to 15 minutes or
                more depending on the data source and your subscription tier. Real-time data availability is
                subject to the limitations of our data providers. Always verify critical pricing data with your
                broker or an official exchange source before executing any trade.
              </li>
              <li>
                <strong>Model Limitations:</strong> AI models are trained on historical data and may not accurately
                predict future market conditions, black swan events, or sudden regime changes. No algorithm or AI
                system can guarantee profitable outcomes.
              </li>
            </ul>
          </section>

          {/* ── 5. IPO & Earnings Data ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">5. IPO &amp; Earnings Calendar Data</h2>
            <p>
              IPO dates, pricing ranges, and related details are sourced from SEC filings, press releases, and
              third-party data providers. All IPO dates are <strong>estimates</strong> and subject to change without
              notice. Companies may postpone, withdraw, or modify their IPO plans at any time. Earnings report
              dates and estimated EPS figures are similarly subject to revision. HedgeFun is not responsible for any
              decisions made based on preliminary or estimated IPO or earnings data.
            </p>
          </section>

          {/* ── 6. Analyst Ratings ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">6. Analyst Ratings &amp; Price Targets</h2>
            <p>
              Analyst ratings, consensus price targets, and recommendation summaries displayed on HedgeFun are
              aggregated from third-party research providers and represent the opinions of individual analysts or
              firms. These ratings do <strong>not</strong> represent the views, recommendations, or endorsements of
              HedgeFun. Analyst opinions can change rapidly and without notice, and historical accuracy of analyst
              predictions varies significantly. You should not rely solely on analyst ratings when making investment
              decisions.
            </p>
          </section>

          {/* ── 7. No Guarantee of Availability ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">7. No Guarantee of Availability</h2>
            <p>
              HedgeFun makes no guarantee that the website, its data feeds, or any associated services will be
              available without interruption. We reserve the right to modify, suspend, or discontinue any feature
              or service at any time without prior notice. Data outages, API rate limits, and third-party service
              disruptions may affect the availability and accuracy of information displayed on the platform.
            </p>
          </section>

          {/* ── 8. Limitation of Liability ── */}
          <section>
            <h2 className="text-[1.125rem] font-bold mb-2">8. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by applicable law, HedgeFun, its owners, officers, employees,
              affiliates, and data providers shall not be liable for any direct, indirect, incidental, special,
              consequential, or punitive damages — including but not limited to loss of profits, loss of data,
              trading losses, or business interruption — arising out of or in connection with your use of, or
              inability to use, this website or any information contained herein, even if HedgeFun has been advised
              of the possibility of such damages. Your use of this website and reliance on any information provided
              is entirely at your own risk.
            </p>
          </section>

          {/* ── 9. Contact ── */}
          <section className="border-t border-border pt-6 mt-8">
            <h2 className="text-[1.125rem] font-bold mb-2">Questions About This Disclaimer</h2>
            <p>
              If you have any questions regarding this disclaimer or our data practices, please contact us at{" "}
              <a href="mailto:info@hedgefun.fun" className="text-primary hover:underline">info@hedgefun.fun</a> or
              visit our{" "}
              <Link to="/contact" className="text-primary hover:underline">Contact Us</Link> page.
            </p>
          </section>
        </div>
      </div>

      <div className="w-full flex flex-col items-center border-t border-border bg-surface py-1 mt-8">
        <AdBanner slot="bottom" />
      </div>
    </>
  );
}
